"""
Database Models - SQLAlchemy ORM definitions for the Misinformation Analyzer
"""
from datetime import datetime
from extension import db


class Post(db.Model):
    """Represents a social media post with analysis results."""
    __tablename__ = 'posts'
    
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.String(100), unique=True, nullable=False, index=True)
    user_id = db.Column(db.String(100), nullable=False, index=True)
    post_text = db.Column(db.Text, nullable=False)
    cleaned_text = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    retweet_count = db.Column(db.Integer, default=0)
    reply_count = db.Column(db.Integer, default=0)
    
    # ML Analysis Results
    misinfo_label = db.Column(db.String(50))  # factual, misinformation, propaganda
    misinfo_confidence = db.Column(db.Float)
    stance_label = db.Column(db.String(50))   # support, oppose, neutral
    stance_confidence = db.Column(db.Float)
    topic_id = db.Column(db.Integer)
    is_bot_user = db.Column(db.Boolean, default=False)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    dataset_id = db.Column(db.Integer, db.ForeignKey('datasets.id'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'post_id': self.post_id,
            'user_id': self.user_id,
            'post_text': self.post_text,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'retweet_count': self.retweet_count,
            'reply_count': self.reply_count,
            'misinfo_label': self.misinfo_label,
            'misinfo_confidence': self.misinfo_confidence,
            'stance_label': self.stance_label,
            'stance_confidence': self.stance_confidence,
            'topic_id': self.topic_id,
            'is_bot_user': self.is_bot_user,
        }


class User(db.Model):
    """Represents a social media user with behavioral features."""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), unique=True, nullable=False, index=True)
    post_count = db.Column(db.Integer, default=0)
    total_retweets = db.Column(db.Integer, default=0)
    total_replies = db.Column(db.Integer, default=0)
    
    # Bot detection features
    post_frequency = db.Column(db.Float)
    similarity_score = db.Column(db.Float)
    retweet_ratio = db.Column(db.Float)
    
    # Bot detection result
    is_bot = db.Column(db.Boolean, default=False)
    bot_probability = db.Column(db.Float)
    
    # Network metrics
    degree_centrality = db.Column(db.Float)
    pagerank = db.Column(db.Float)
    community_id = db.Column(db.Integer)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'user_id': self.user_id,
            'post_count': self.post_count,
            'total_retweets': self.total_retweets,
            'is_bot': self.is_bot,
            'bot_probability': self.bot_probability,
            'degree_centrality': self.degree_centrality,
            'pagerank': self.pagerank,
            'community_id': self.community_id,
        }


class Dataset(db.Model):
    """Tracks uploaded datasets."""
    __tablename__ = 'datasets'
    
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    post_count = db.Column(db.Integer, default=0)
    status = db.Column(db.String(50), default='uploaded')  # uploaded, processing, analyzed
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    analyzed_at = db.Column(db.DateTime)
    
    posts = db.relationship('Post', backref='dataset', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'post_count': self.post_count,
            'status': self.status,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'analyzed_at': self.analyzed_at.isoformat() if self.analyzed_at else None,
        }


class Topic(db.Model):
    """Represents a discovered narrative/topic cluster."""
    __tablename__ = 'topics'
    
    id = db.Column(db.Integer, primary_key=True)
    topic_id = db.Column(db.Integer, nullable=False)
    keywords = db.Column(db.Text)  # JSON string of keywords
    post_count = db.Column(db.Integer, default=0)
    misinfo_ratio = db.Column(db.Float, default=0.0)
    dataset_id = db.Column(db.Integer, db.ForeignKey('datasets.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        import json
        return {
            'topic_id': self.topic_id,
            'keywords': json.loads(self.keywords) if self.keywords else [],
            'post_count': self.post_count,
            'misinfo_ratio': self.misinfo_ratio,
        }
