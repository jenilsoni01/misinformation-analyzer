"""
Topic / Narrative Detection Service
Uses BERTopic + Sentence Transformers to discover narratives spreading across posts.

Pipeline:
1. Generate embeddings with sentence-transformers/all-MiniLM-L6-v2
2. Cluster with UMAP + HDBSCAN (via BERTopic)
3. Extract top keywords per cluster using c-TF-IDF
"""
import logging
import json
import numpy as np
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class TopicDetector:
    """
    Discovers narrative clusters in social media post datasets.
    
    Uses BERTopic which combines:
    - Sentence Transformers for semantic embeddings
    - UMAP for dimensionality reduction  
    - HDBSCAN for density-based clustering
    - c-TF-IDF for topic keyword extraction
    """
    
    def __init__(self):
        self.embedding_model = None
        self.topic_model = None
        self._loaded = False
    
    def _ensure_loaded(self):
        """Lazy-load models on first use."""
        if self._loaded:
            return
        
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading sentence transformer model...")
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("Sentence transformer loaded")
            self._loaded = True
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
    
    def _create_bertopic_model(self, n_topics: str = 'auto'):
        """Create a BERTopic model instance."""
        try:
            from bertopic import BERTopic
            from umap import UMAP
            from hdbscan import HDBSCAN
            
            # Dimensionality reduction
            umap_model = UMAP(
                n_neighbors=15,
                n_components=5,
                min_dist=0.0,
                metric='cosine',
                random_state=42
            )
            
            # Clustering
            hdbscan_model = HDBSCAN(
                min_cluster_size=3,
                metric='euclidean',
                cluster_selection_method='eom',
                prediction_data=True
            )
            
            model = BERTopic(
                embedding_model=self.embedding_model,
                umap_model=umap_model,
                hdbscan_model=hdbscan_model,
                top_n_words=10,
                verbose=False
            )
            return model
            
        except Exception as e:
            logger.error(f"Failed to create BERTopic model: {e}")
            return None
    
    def fit_transform(self, texts: List[str]) -> Tuple[List[int], List[Dict]]:
        """
        Discover topics in a collection of texts.
        
        Args:
            texts: List of post texts to analyze
            
        Returns:
            Tuple of:
            - topics: List of topic IDs per document (-1 = outlier)
            - topic_info: List of dicts with topic_id, keywords, post_count
        """
        self._ensure_loaded()
        
        if len(texts) < 5:
            logger.warning("Too few texts for topic modeling (need >= 5)")
            return [-1] * len(texts), []
        
        # Filter empty texts
        valid_indices = [i for i, t in enumerate(texts) if t and len(str(t).split()) >= 3]
        valid_texts = [texts[i] for i in valid_indices]
        
        if len(valid_texts) < 5:
            return [-1] * len(texts), []
        
        try:
            # Try BERTopic first
            model = self._create_bertopic_model()
            
            if model is not None:
                topics_raw, probs = model.fit_transform(valid_texts)
                topic_info = self._extract_topic_info(model, valid_texts, topics_raw)
                
                # Map back to original indices
                all_topics = [-1] * len(texts)
                for i, orig_idx in enumerate(valid_indices):
                    all_topics[orig_idx] = int(topics_raw[i])
                
                return all_topics, topic_info
            else:
                # Fallback: simple TF-IDF clustering
                return self._fallback_clustering(texts)
                
        except Exception as e:
            logger.error(f"Topic modeling failed: {e}")
            return self._fallback_clustering(texts)
    
    def _extract_topic_info(self, model, texts: List[str], topics: List[int]) -> List[Dict]:
        """Extract topic metadata from fitted BERTopic model."""
        topic_info = []
        unique_topics = set(topics)
        
        for topic_id in sorted(unique_topics):
            if topic_id == -1:
                continue  # Skip outliers
            
            try:
                # Get top keywords for this topic
                topic_words = model.get_topic(topic_id)
                keywords = [word for word, score in topic_words[:10]] if topic_words else []
                
                # Count posts in this topic
                post_count = topics.count(topic_id)
                
                topic_info.append({
                    'topic_id': topic_id,
                    'keywords': keywords,
                    'post_count': post_count,
                    'keyword_scores': {word: float(score) for word, score in (topic_words or [])[:10]}
                })
            except Exception as e:
                logger.warning(f"Failed to extract info for topic {topic_id}: {e}")
        
        return topic_info
    
    def _fallback_clustering(self, texts: List[str]) -> Tuple[List[int], List[Dict]]:
        """
        Simple TF-IDF + KMeans fallback when BERTopic unavailable.
        """
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.cluster import KMeans
            
            n_clusters = min(5, len(texts) // 3)
            if n_clusters < 2:
                return [-1] * len(texts), []
            
            vectorizer = TfidfVectorizer(max_features=100, stop_words='english', min_df=1)
            X = vectorizer.fit_transform(texts)
            
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            topics = kmeans.fit_predict(X).tolist()
            
            # Extract top keywords per cluster
            feature_names = vectorizer.get_feature_names_out()
            topic_info = []
            
            for cluster_id in range(n_clusters):
                center = kmeans.cluster_centers_[cluster_id]
                top_indices = center.argsort()[-10:][::-1]
                keywords = [feature_names[i] for i in top_indices]
                post_count = topics.count(cluster_id)
                
                topic_info.append({
                    'topic_id': cluster_id,
                    'keywords': keywords,
                    'post_count': post_count,
                    'keyword_scores': {}
                })
            
            return topics, topic_info
            
        except Exception as e:
            logger.error(f"Fallback clustering failed: {e}")
            return [-1] * len(texts), []


# Singleton
_topic_detector = None


def get_topic_detector() -> TopicDetector:
    global _topic_detector
    if _topic_detector is None:
        _topic_detector = TopicDetector()
    return _topic_detector
