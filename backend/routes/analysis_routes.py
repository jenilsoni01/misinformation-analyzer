"""
Analysis Routes - ML inference and results endpoints
"""
import logging
from flask import Blueprint, request, jsonify

analysis_bp = Blueprint('analysis', __name__)
logger = logging.getLogger(__name__)


@analysis_bp.route('/analyze_posts', methods=['POST'])
def analyze_posts():
    """
    Trigger full ML analysis pipeline on a dataset.
    
    Body: { "dataset_id": 1, "topic": "climate change" }
    """
    data = request.get_json()
    
    if not data or 'dataset_id' not in data:
        return jsonify({'error': 'dataset_id is required'}), 400
    
    dataset_id = data['dataset_id']
    topic_query = data.get('topic', 'the topic')
    
    from services.analysis_orchestrator import get_orchestrator
    
    orchestrator = get_orchestrator()
    results = orchestrator.run_full_analysis(dataset_id, topic_query)
    
    if 'error' in results:
        return jsonify(results), 500
    
    return jsonify(results)


@analysis_bp.route('/misinformation_results', methods=['GET'])
def misinformation_results():
    """
    Get misinformation classification results.
    
    Query params:
    - dataset_id (required)
    - page, per_page (pagination)
    - label (filter by: factual/misinformation/propaganda)
    """
    from models.database_models import Post, Dataset
    
    dataset_id = request.args.get('dataset_id', type=int)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    label_filter = request.args.get('label')
    
    if not dataset_id:
        return jsonify({'error': 'dataset_id is required'}), 400
    
    query = Post.query.filter_by(dataset_id=dataset_id)
    
    if label_filter:
        query = query.filter_by(misinfo_label=label_filter)
    
    # Summary statistics
    all_posts = Post.query.filter_by(dataset_id=dataset_id).all()
    
    label_counts = {'factual': 0, 'misinformation': 0, 'propaganda': 0, 'unanalyzed': 0}
    confidence_scores = []
    timeline_data = {}
    
    for p in all_posts:
        label = p.misinfo_label or 'unanalyzed'
        label_counts[label] = label_counts.get(label, 0) + 1
        
        if p.misinfo_confidence:
            confidence_scores.append(p.misinfo_confidence)
        
        # Timeline aggregation by date
        if p.timestamp and p.misinfo_label:
            date_key = p.timestamp.strftime('%Y-%m-%d')
            if date_key not in timeline_data:
                timeline_data[date_key] = {'factual': 0, 'misinformation': 0, 'propaganda': 0}
            timeline_data[date_key][p.misinfo_label] = timeline_data[date_key].get(p.misinfo_label, 0) + 1
    
    # Paginated posts
    paginated = query.order_by(Post.timestamp.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    timeline = [
        {'date': k, **v} 
        for k, v in sorted(timeline_data.items())
    ]
    
    return jsonify({
        'posts': [p.to_dict() for p in paginated.items],
        'total': paginated.total,
        'page': page,
        'per_page': per_page,
        'pages': paginated.pages,
        'summary': {
            'label_distribution': label_counts,
            'avg_confidence': round(sum(confidence_scores) / max(len(confidence_scores), 1), 3),
            'timeline': timeline
        }
    })


@analysis_bp.route('/stance_results', methods=['GET'])
def stance_results():
    """
    Get stance detection results.
    
    Query params:
    - dataset_id (required)
    - label (filter by: support/oppose/neutral)
    """
    from models.database_models import Post
    
    dataset_id = request.args.get('dataset_id', type=int)
    label_filter = request.args.get('label')
    
    if not dataset_id:
        return jsonify({'error': 'dataset_id is required'}), 400
    
    query = Post.query.filter_by(dataset_id=dataset_id)
    
    if label_filter:
        query = query.filter_by(stance_label=label_filter)
    
    all_posts = Post.query.filter_by(dataset_id=dataset_id).all()
    
    stance_counts = {'support': 0, 'oppose': 0, 'neutral': 0, 'unanalyzed': 0}
    
    for p in all_posts:
        label = p.stance_label or 'unanalyzed'
        stance_counts[label] = stance_counts.get(label, 0) + 1
    
    posts = query.limit(50).all()
    
    return jsonify({
        'posts': [p.to_dict() for p in posts],
        'summary': {
            'stance_distribution': stance_counts,
            'total': len(all_posts)
        }
    })


@analysis_bp.route('/topics', methods=['GET'])
def get_topics():
    """
    Get discovered topics/narratives.
    
    Query params:
    - dataset_id (required)
    """
    from models.database_models import Topic, Post
    
    dataset_id = request.args.get('dataset_id', type=int)
    
    if not dataset_id:
        return jsonify({'error': 'dataset_id is required'}), 400
    
    topics = Topic.query.filter_by(dataset_id=dataset_id).order_by(
        Topic.post_count.desc()
    ).all()
    
    # Add example posts per topic
    topics_data = []
    for t in topics:
        topic_dict = t.to_dict()
        
        # Get sample posts for this topic
        sample_posts = Post.query.filter_by(
            dataset_id=dataset_id, 
            topic_id=t.topic_id
        ).limit(3).all()
        
        topic_dict['sample_posts'] = [
            {'text': p.post_text[:100] + '...' if len(p.post_text) > 100 else p.post_text,
             'label': p.misinfo_label}
            for p in sample_posts
        ]
        
        topics_data.append(topic_dict)
    
    return jsonify({
        'topics': topics_data,
        'total_topics': len(topics_data)
    })


@analysis_bp.route('/bot_detection', methods=['GET'])
def bot_detection():
    """
    Get bot detection results.
    
    Query params:
    - dataset_id (required)
    - bots_only (bool, default false)
    """
    from models.database_models import User, Post
    
    dataset_id = request.args.get('dataset_id', type=int)
    bots_only = request.args.get('bots_only', 'false').lower() == 'true'
    
    if not dataset_id:
        return jsonify({'error': 'dataset_id is required'}), 400
    
    # Get users who have posts in this dataset
    user_ids_in_dataset = [
        r[0] for r in Post.query.filter_by(dataset_id=dataset_id)
        .with_entities(Post.user_id).distinct().all()
    ]
    
    query = User.query.filter(User.user_id.in_(user_ids_in_dataset))
    
    if bots_only:
        query = query.filter_by(is_bot=True)
    
    users = query.order_by(User.bot_probability.desc()).all()
    
    bot_count = sum(1 for u in users if u.is_bot)
    total_users = len(users)
    
    return jsonify({
        'users': [u.to_dict() for u in users],
        'summary': {
            'total_users': total_users,
            'bot_count': bot_count,
            'human_count': total_users - bot_count,
            'bot_percentage': round(bot_count / max(total_users, 1) * 100, 1)
        }
    })
