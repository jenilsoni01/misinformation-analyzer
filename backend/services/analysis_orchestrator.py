"""
Analysis Orchestration Service
Coordinates the full ML pipeline: preprocessing -> classification -> topics -> network
"""
import logging
import json
from datetime import datetime
from typing import Dict
import pandas as pd

logger = logging.getLogger(__name__)


class AnalysisOrchestrator:
    """
    Orchestrates the complete analysis pipeline for a dataset.
    
    Pipeline steps:
    1. Load posts from database
    2. Clean text
    3. Classify misinformation (batch)
    4. Detect stance (batch)
    5. Discover topics/narratives
    6. Detect bots
    7. Build network graph
    8. Save all results to database
    """
    
    def run_full_analysis(self, dataset_id: int, topic_query: str = "the topic") -> Dict:
        """
        Run complete analysis pipeline on a dataset.
        
        Args:
            dataset_id: Database ID of the dataset to analyze
            topic_query: Topic for stance detection (e.g., "climate change")
            
        Returns:
            Dict with all analysis results
        """
        from app import db
        from models.database_models import Post, Dataset, User, Topic
        from services.text_preprocessor import preprocessor
        from ml_models.misinfo_classifier import get_misinfo_classifier, get_stance_detector
        from ml_models.bot_detector import get_bot_detector
        from ml_models.topic_detector import get_topic_detector
        from ml_models.network_analyzer import get_network_analyzer
        
        try:
            # Load dataset
            dataset = Dataset.query.get(dataset_id)
            if not dataset:
                return {'error': 'Dataset not found'}
            
            dataset.status = 'processing'
            db.session.commit()
            
            # Load posts
            posts = Post.query.filter_by(dataset_id=dataset_id).all()
            if not posts:
                dataset.status = 'error'
                db.session.commit()
                return {'error': 'No posts found in dataset'}
            
            logger.info(f"Analyzing {len(posts)} posts from dataset {dataset_id}")
            
            # Build DataFrame for batch processing
            posts_data = []
            for p in posts:
                posts_data.append({
                    'id': p.id,
                    'post_id': p.post_id,
                    'user_id': p.user_id,
                    'post_text': p.post_text,
                    'cleaned_text': p.cleaned_text or p.post_text,
                    'timestamp': p.timestamp,
                    'retweet_count': p.retweet_count or 0,
                    'reply_count': p.reply_count or 0
                })
            
            df = pd.DataFrame(posts_data)
            texts = df['cleaned_text'].tolist()
            
            # Step 1: Misinformation Classification
            logger.info("Running misinformation classification...")
            misinfo_clf = get_misinfo_classifier()
            misinfo_results = misinfo_clf.predict_batch(texts)
            
            # Step 2: Stance Detection
            logger.info("Running stance detection...")
            stance_det = get_stance_detector()
            stance_results = stance_det.detect_batch(texts, topic=topic_query)
            
            # Step 3: Topic Detection
            logger.info("Running topic/narrative detection...")
            topic_det = get_topic_detector()
            topic_assignments, topic_info = topic_det.fit_transform(texts)
            
            # Step 4: Update posts in database
            misinfo_counts = {'factual': 0, 'misinformation': 0, 'propaganda': 0}
            stance_counts = {'support': 0, 'oppose': 0, 'neutral': 0}
            
            for i, post in enumerate(posts):
                if i < len(misinfo_results):
                    mr = misinfo_results[i]
                    post.misinfo_label = mr.get('label', 'factual')
                    post.misinfo_confidence = mr.get('confidence', 0.5)
                    misinfo_counts[post.misinfo_label] = misinfo_counts.get(post.misinfo_label, 0) + 1
                
                if i < len(stance_results):
                    sr = stance_results[i]
                    post.stance_label = sr.get('label', 'neutral')
                    post.stance_confidence = sr.get('confidence', 0.5)
                    stance_counts[post.stance_label] = stance_counts.get(post.stance_label, 0) + 1
                
                if i < len(topic_assignments):
                    post.topic_id = int(topic_assignments[i])
            
            db.session.flush()
            
            # Step 5: Save topics
            Topic.query.filter_by(dataset_id=dataset_id).delete()
            for ti in topic_info:
                topic_obj = Topic(
                    topic_id=ti['topic_id'],
                    keywords=json.dumps(ti['keywords']),
                    post_count=ti['post_count'],
                    dataset_id=dataset_id
                )
                # Compute misinfo ratio for this topic
                topic_posts_indices = [
                    i for i, t in enumerate(topic_assignments) if t == ti['topic_id']
                ]
                if topic_posts_indices:
                    misinfo_in_topic = sum(
                        1 for i in topic_posts_indices 
                        if i < len(misinfo_results) and 
                        misinfo_results[i].get('label') in ['misinformation', 'propaganda']
                    )
                    topic_obj.misinfo_ratio = misinfo_in_topic / len(topic_posts_indices)
                
                db.session.add(topic_obj)
            
            # Step 6: Bot Detection
            logger.info("Running bot detection...")
            bot_det = get_bot_detector()
            # Re-add misinfo labels to df for network analysis
            aligned_labels = ['factual'] * len(df)
            for idx, result in enumerate(misinfo_results[:len(df)]):
                aligned_labels[idx] = result.get('label', 'factual')
            df['misinfo_label'] = aligned_labels
            user_results = bot_det.analyze_users(df)
            
            # Save/update users in database
            for _, row in user_results.iterrows():
                user_id = str(row.get('user_id', '')).strip()
                if not user_id:
                    continue

                user = User.query.filter_by(user_id=user_id).first()
                if not user:
                    user = User(user_id=user_id)
                    db.session.add(user)
                
                user.post_count = int(row.get('post_count', 0))
                user.total_retweets = int(row.get('total_retweets', 0))
                user.post_frequency = float(row.get('post_frequency', 0))
                user.similarity_score = float(row.get('similarity_score', 0))
                user.retweet_ratio = float(row.get('retweet_ratio', 0))
                user.is_bot = bool(row.get('is_bot', False))
                user.bot_probability = float(row.get('probability', 0))
                
                # Mark posts as bot
                Post.query.filter_by(user_id=user_id, dataset_id=dataset_id).update(
                    {'is_bot_user': bool(row.get('is_bot', False))}
                )
            
            # Step 7: Network Analysis
            logger.info("Building propagation network...")
            net_analyzer = get_network_analyzer()
            graph_data = net_analyzer.build_graph(df, user_results)
            
            # Update user network metrics
            for node in graph_data.get('nodes', []):
                user = User.query.filter_by(user_id=node['id']).first()
                if user:
                    user.degree_centrality = node.get('degree_centrality', 0)
                    user.pagerank = node.get('pagerank', 0)
                    user.community_id = node.get('community', 0)
            
            # Finalize dataset
            dataset.status = 'analyzed'
            dataset.analyzed_at = datetime.utcnow()
            db.session.commit()
            
            logger.info(f"Analysis complete for dataset {dataset_id}")
            
            return {
                'success': True,
                'dataset_id': dataset_id,
                'post_count': len(posts),
                'misinfo_distribution': misinfo_counts,
                'stance_distribution': stance_counts,
                'topics_found': len(topic_info),
                'bot_count': int(user_results['is_bot'].sum()) if not user_results.empty else 0,
                'graph_stats': graph_data.get('stats', {})
            }
            
        except Exception as e:
            logger.error(f"Analysis pipeline failed: {e}", exc_info=True)
            try:
                dataset = Dataset.query.get(dataset_id)
                if dataset:
                    dataset.status = 'error'
                    db.session.commit()
            except:
                pass
            return {'error': str(e)}

# Singleton
_orchestrator = None


def get_orchestrator() -> AnalysisOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = AnalysisOrchestrator()
    return _orchestrator
