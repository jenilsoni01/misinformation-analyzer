"""
Bot Detection Model
Uses RandomForest classifier to identify suspicious/bot accounts based on
behavioral features: posting frequency, text similarity, retweet patterns, etc.
"""
import os
import logging
import numpy as np
import pandas as pd
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


class BotDetector:
    """
    Detects bot accounts using behavioral feature analysis.
    
    Features used:
    - post_frequency: Posts per day
    - similarity_score: Average text similarity between posts (bots repeat content)
    - retweet_ratio: Proportion of activity that is retweets
    - avg_reply_count: Average replies received
    
    Model: RandomForest (interpretable, robust to feature scale)
    Fallback: Rule-based heuristics when model is unavailable
    """
    
    FEATURE_COLUMNS = [
        'post_frequency',
        'similarity_score', 
        'retweet_ratio',
        'avg_reply_count'
    ]
    
    # Thresholds for rule-based fallback
    BOT_THRESHOLDS = {
        'post_frequency': 20.0,    # > 20 posts/day is suspicious
        'similarity_score': 0.75,  # > 75% similarity = likely copy-paste bot
        'retweet_ratio': 0.85,     # > 85% retweets = amplification bot
    }
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or os.getenv('BOT_MODEL_PATH', '../models/bot_model.joblib')
        self.model = None
        self.scaler = None
        self._load_model()
    
    def _load_model(self):
        """Load trained model or prepare rule-based fallback."""
        try:
            import joblib
            
            if os.path.exists(self.model_path):
                saved = joblib.load(self.model_path)
                self.model = saved.get('model')
                self.scaler = saved.get('scaler')
                logger.info(f"Bot detection model loaded from {self.model_path}")
            else:
                logger.info("Bot model not found. Using rule-based heuristics as fallback.")
                
        except Exception as e:
            logger.error(f"Failed to load bot model: {e}")
    
    def _rule_based_score(self, features: Dict) -> float:
        """
        Rule-based bot probability score when ML model unavailable.
        
        Each violated threshold contributes to the score.
        """
        score = 0.0
        violations = 0
        
        post_freq = features.get('post_frequency', 0)
        if post_freq > self.BOT_THRESHOLDS['post_frequency']:
            # Scale: 20 posts/day = 0.3, 50+ = 0.6
            score += min(0.6, (post_freq - 20) / 50)
            violations += 1
        
        sim_score = features.get('similarity_score', 0)
        if sim_score > self.BOT_THRESHOLDS['similarity_score']:
            score += (sim_score - 0.75) * 2
            violations += 1
        
        rt_ratio = features.get('retweet_ratio', 0)
        if rt_ratio > self.BOT_THRESHOLDS['retweet_ratio']:
            score += (rt_ratio - 0.85) * 3
            violations += 1
        
        # Multiple violations amplify score
        if violations >= 2:
            score *= 1.5
        
        return min(1.0, max(0.0, score))
    
    def predict(self, features: Dict) -> Dict:
        """
        Predict if an account is a bot.
        
        Args:
            features: Dict with keys matching FEATURE_COLUMNS
            
        Returns:
            Dict with 'is_bot' (bool), 'probability' (float), 'method' (str)
        """
        try:
            feature_vector = [features.get(col, 0) for col in self.FEATURE_COLUMNS]
            
            if self.model is not None and self.scaler is not None:
                # ML model prediction
                X = np.array(feature_vector).reshape(1, -1)
                X_scaled = self.scaler.transform(X)
                proba = self.model.predict_proba(X_scaled)[0]
                bot_prob = proba[1] if len(proba) > 1 else proba[0]
                
                return {
                    'is_bot': bool(bot_prob > 0.5),
                    'probability': float(bot_prob),
                    'method': 'ml_model'
                }
            else:
                # Rule-based fallback
                prob = self._rule_based_score(features)
                return {
                    'is_bot': prob > 0.5,
                    'probability': prob,
                    'method': 'rule_based'
                }
                
        except Exception as e:
            logger.error(f"Bot detection error: {e}")
            return {'is_bot': False, 'probability': 0.0, 'method': 'error'}
    
    def analyze_users(self, posts_df: pd.DataFrame) -> pd.DataFrame:
        """
        Analyze all users in a posts DataFrame to detect bots.
        
        Computes behavioral features per user then classifies each.
        
        Args:
            posts_df: DataFrame with columns [user_id, post_text, retweet_count, timestamp]
            
        Returns:
            DataFrame with user_id and bot detection results
        """
        if posts_df.empty:
            return pd.DataFrame()
        
        # Compute per-user features
        user_features = []
        
        for user_id, group in posts_df.groupby('user_id'):
            # Post frequency: posts per day
            if 'timestamp' in group.columns and len(group) > 1:
                try:
                    timestamps = pd.to_datetime(group['timestamp'])
                    time_span = (timestamps.max() - timestamps.min()).days + 1
                    post_freq = len(group) / max(time_span, 1)
                except:
                    post_freq = len(group)
            else:
                post_freq = len(group)
            
            # Text similarity score (using simple word overlap as proxy)
            texts = group['post_text'].dropna().tolist()
            sim_score = self._compute_similarity_score(texts)
            
            # Retweet ratio
            total_retweets = group['retweet_count'].sum() if 'retweet_count' in group.columns else 0
            total_replies = group['reply_count'].sum() if 'reply_count' in group.columns else 0
            total_interactions = total_retweets + total_replies
            retweet_ratio = total_retweets / max(total_interactions, 1)
            
            avg_reply = group['reply_count'].mean() if 'reply_count' in group.columns else 0
            
            features = {
                'user_id': user_id,
                'post_frequency': post_freq,
                'similarity_score': sim_score,
                'retweet_ratio': retweet_ratio,
                'avg_reply_count': avg_reply,
                'post_count': len(group),
                'total_retweets': int(total_retweets),
            }
            
            # Run bot detection
            result = self.predict(features)
            features.update(result)
            user_features.append(features)
        
        return pd.DataFrame(user_features)
    
    def _compute_similarity_score(self, texts: List[str]) -> float:
        """
        Compute average pairwise text similarity using Jaccard on word sets.
        High similarity = bot behavior (posting same content repeatedly).
        """
        if len(texts) < 2:
            return 0.0
        
        # Use first 5 posts for efficiency
        sample = texts[:5]
        word_sets = [set(str(t).lower().split()) for t in sample if t]
        
        if len(word_sets) < 2:
            return 0.0
        
        similarities = []
        for i in range(len(word_sets)):
            for j in range(i + 1, len(word_sets)):
                intersection = len(word_sets[i] & word_sets[j])
                union = len(word_sets[i] | word_sets[j])
                if union > 0:
                    similarities.append(intersection / union)
        
        return float(np.mean(similarities)) if similarities else 0.0


# Singleton instance
_bot_detector = None


def get_bot_detector() -> BotDetector:
    global _bot_detector
    if _bot_detector is None:
        _bot_detector = BotDetector()
    return _bot_detector
