"""
Misinformation Classification Service
Uses a DistilBERT-based model to classify posts as factual/misinformation/propaganda.

When a fine-tuned model is not available, falls back to a zero-shot pipeline
using HuggingFace's bart-large-mnli for immediate usability.
"""
import os
import logging
import numpy as np
from typing import List, Dict

logger = logging.getLogger(__name__)

# Label mapping
LABELS = ['factual', 'misinformation', 'propaganda']
LABEL2ID = {label: i for i, label in enumerate(LABELS)}
ID2LABEL = {i: label for i, label in enumerate(LABELS)}


class MisinformationClassifier:
    """
    Classifies social media posts into: factual, misinformation, propaganda.
    
    Model priority:
    1. Fine-tuned DistilBERT (if available at model_path)
    2. Zero-shot classification fallback (facebook/bart-large-mnli)
    """
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or os.getenv('MISINFO_MODEL_PATH', '../models/misinfo_model')
        self.pipeline = None
        self.model_type = None
        self._load_model()
    
    def _load_model(self):
        """Load model - fine-tuned if available, else zero-shot fallback."""
        try:
            from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
            
            if os.path.exists(self.model_path):
                # Load fine-tuned model
                logger.info(f"Loading fine-tuned model from {self.model_path}")
                tokenizer = AutoTokenizer.from_pretrained(self.model_path)
                model = AutoModelForSequenceClassification.from_pretrained(self.model_path)
                self.pipeline = pipeline(
                    'text-classification',
                    model=model,
                    tokenizer=tokenizer,
                    return_all_scores=True
                )
                self.model_type = 'fine-tuned'
                logger.info("Fine-tuned misinformation model loaded successfully")
            else:
                # Fallback: zero-shot classification
                logger.info("Fine-tuned model not found. Using zero-shot classification fallback.")
                self.pipeline = pipeline(
                    'zero-shot-classification',
                    model='facebook/bart-large-mnli',
                    device=-1  # CPU
                )
                self.model_type = 'zero-shot'
                logger.info("Zero-shot classification pipeline loaded")
                
        except Exception as e:
            logger.error(f"Failed to load misinformation model: {e}")
            self.pipeline = None
    
    def predict(self, text: str) -> Dict:
        """
        Classify a single text post.
        
        Returns:
            dict with 'label' (str) and 'confidence' (float) and 'scores' (dict)
        """
        if not self.pipeline or not text.strip():
            return {'label': 'factual', 'confidence': 0.5, 'scores': {}}
        
        try:
            if self.model_type == 'fine-tuned':
                results = self.pipeline(text[:512], truncation=True)
                scores = {r['label']: r['score'] for r in results[0]}
                best_label = max(scores, key=scores.get)
                return {
                    'label': best_label,
                    'confidence': scores[best_label],
                    'scores': scores
                }
            else:
                # Zero-shot: classify against our label candidates
                hypothesis_template = "This post contains {}."
                candidate_labels = [
                    'verified factual information',
                    'misinformation or false claims', 
                    'propaganda or manipulative content'
                ]
                result = self.pipeline(
                    text[:1024],
                    candidate_labels=candidate_labels,
                    hypothesis_template=hypothesis_template
                )
                
                # Map back to our labels
                label_map = {
                    'verified factual information': 'factual',
                    'misinformation or false claims': 'misinformation',
                    'propaganda or manipulative content': 'propaganda'
                }
                
                scores = dict(zip(result['labels'], result['scores']))
                best_raw = result['labels'][0]
                best_label = label_map[best_raw]
                
                mapped_scores = {label_map[k]: v for k, v in scores.items()}
                return {
                    'label': best_label,
                    'confidence': result['scores'][0],
                    'scores': mapped_scores
                }
                
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return {'label': 'factual', 'confidence': 0.5, 'scores': {}}
    
    def predict_batch(self, texts: List[str], batch_size: int = 16) -> List[Dict]:
        """Classify a batch of texts efficiently."""
        results = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            for text in batch:
                results.append(self.predict(text))
        return results


class StanceDetector:
    """
    Detects stance toward a topic: support, oppose, neutral.
    
    Uses zero-shot classification by default with topic-aware prompting.
    Fine-tuned model can replace this when available.
    """
    
    STANCE_LABELS = ['support', 'oppose', 'neutral']
    
    def __init__(self, model_path: str = None):
        self.model_path = model_path or os.getenv('STANCE_MODEL_PATH', '../models/stance_model')
        self.pipeline = None
        self._load_model()
    
    def _load_model(self):
        """Load stance detection model."""
        try:
            from transformers import pipeline
            
            if os.path.exists(self.model_path):
                self.pipeline = pipeline(
                    'text-classification',
                    model=self.model_path,
                    return_all_scores=True
                )
                logger.info("Fine-tuned stance model loaded")
            else:
                # Zero-shot fallback
                self.pipeline = pipeline(
                    'zero-shot-classification',
                    model='facebook/bart-large-mnli',
                    device=-1
                )
                logger.info("Zero-shot stance detection pipeline loaded")
        except Exception as e:
            logger.error(f"Failed to load stance model: {e}")
    
    def detect_stance(self, text: str, topic: str = "the topic") -> Dict:
        """
        Detect stance of a post toward a given topic.
        
        Args:
            text: The post text
            topic: The topic to measure stance toward (e.g., "climate change")
            
        Returns:
            dict with 'label', 'confidence', 'scores'
        """
        if not self.pipeline or not text.strip():
            return {'label': 'neutral', 'confidence': 0.5, 'scores': {}}
        
        try:
            candidate_labels = [
                f'supports {topic}',
                f'opposes {topic}',
                f'neutral about {topic}'
            ]
            
            result = self.pipeline(
                text[:1024],
                candidate_labels=candidate_labels
            )
            
            label_map = {
                f'supports {topic}': 'support',
                f'opposes {topic}': 'oppose',
                f'neutral about {topic}': 'neutral'
            }
            
            scores = dict(zip(result['labels'], result['scores']))
            best_raw = result['labels'][0]
            best_label = label_map.get(best_raw, 'neutral')
            mapped_scores = {label_map.get(k, k): v for k, v in scores.items()}
            
            return {
                'label': best_label,
                'confidence': result['scores'][0],
                'scores': mapped_scores
            }
        except Exception as e:
            logger.error(f"Stance detection error: {e}")
            return {'label': 'neutral', 'confidence': 0.5, 'scores': {}}
    
    def detect_batch(self, texts: List[str], topic: str = "the topic") -> List[Dict]:
        """Detect stance for a batch of texts."""
        return [self.detect_stance(t, topic) for t in texts]


# Module-level instances (lazy loaded)
_misinfo_classifier = None
_stance_detector = None


def get_misinfo_classifier() -> MisinformationClassifier:
    global _misinfo_classifier
    if _misinfo_classifier is None:
        _misinfo_classifier = MisinformationClassifier()
    return _misinfo_classifier


def get_stance_detector() -> StanceDetector:
    global _stance_detector
    if _stance_detector is None:
        _stance_detector = StanceDetector()
    return _stance_detector
