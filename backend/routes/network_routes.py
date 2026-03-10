"""
Network Graph Routes - Misinformation propagation network endpoints
"""
import logging
from flask import Blueprint, request, jsonify

network_bp = Blueprint('network', __name__)
logger = logging.getLogger(__name__)


@network_bp.route('/network_graph', methods=['GET'])
def get_network_graph():
    """
    Get the misinformation propagation network graph.
    
    Returns nodes (users) and edges (interactions) with metrics:
    - degree_centrality
    - pagerank  
    - community membership
    - misinfo_ratio per user
    
    Query params:
    - dataset_id (required)
    """
    from models.database_models import Post, User
    from ml_models.network_analyzer import get_network_analyzer
    import pandas as pd
    
    dataset_id = request.args.get('dataset_id', type=int)
    
    if not dataset_id:
        return jsonify({'error': 'dataset_id is required'}), 400
    
    # Load posts
    posts = Post.query.filter_by(dataset_id=dataset_id).all()
    
    if not posts:
        return jsonify({'nodes': [], 'edges': [], 'stats': {}, 'top_spreaders': []})
    
    # Build DataFrame
    posts_data = [{
        'user_id': p.user_id,
        'post_text': p.post_text,
        'misinfo_label': p.misinfo_label or 'factual',
        'retweet_count': p.retweet_count or 0,
        'reply_count': p.reply_count or 0,
        'timestamp': p.timestamp,
        'is_bot': p.is_bot_user or False
    } for p in posts]
    
    df = pd.DataFrame(posts_data)
    
    # Get user bot data
    user_ids = df['user_id'].unique().tolist()
    users = User.query.filter(User.user_id.in_(user_ids)).all()
    user_df = pd.DataFrame([u.to_dict() for u in users]) if users else pd.DataFrame()
    
    # Build and analyze graph
    analyzer = get_network_analyzer()
    graph_data = analyzer.build_graph(df, user_df if not user_df.empty else None)
    
    return jsonify(graph_data)


@network_bp.route('/top_spreaders', methods=['GET'])
def get_top_spreaders():
    """
    Get top misinformation spreaders ranked by influence score.
    
    Influence score = misinfo_ratio * pagerank * 1000
    
    Query params:
    - dataset_id (required)
    - limit (default: 10)
    """
    from models.database_models import Post, User
    
    dataset_id = request.args.get('dataset_id', type=int)
    limit = request.args.get('limit', 10, type=int)
    
    if not dataset_id:
        return jsonify({'error': 'dataset_id is required'}), 400
    
    # Get users with posts in dataset, sorted by influence
    user_ids = [
        r[0] for r in Post.query.filter_by(dataset_id=dataset_id)
        .with_entities(Post.user_id).distinct().all()
    ]
    
    users = User.query.filter(User.user_id.in_(user_ids)).all()
    
    # Compute per-user misinfo stats
    user_stats = {}
    posts = Post.query.filter_by(dataset_id=dataset_id).all()
    
    for p in posts:
        uid = p.user_id
        if uid not in user_stats:
            user_stats[uid] = {'total': 0, 'misinfo': 0}
        user_stats[uid]['total'] += 1
        if p.misinfo_label in ['misinformation', 'propaganda']:
            user_stats[uid]['misinfo'] += 1
    
    spreaders = []
    for u in users:
        stats = user_stats.get(u.user_id, {'total': 1, 'misinfo': 0})
        misinfo_ratio = stats['misinfo'] / max(stats['total'], 1)
        pagerank = u.pagerank or 0.001
        
        spreaders.append({
            'user_id': u.user_id,
            'misinfo_ratio': round(misinfo_ratio, 3),
            'pagerank': round(pagerank, 6),
            'influence_score': round(misinfo_ratio * pagerank * 1000, 4),
            'is_bot': u.is_bot,
            'bot_probability': u.bot_probability,
            'post_count': u.post_count,
            'degree_centrality': u.degree_centrality,
            'community_id': u.community_id
        })
    
    spreaders.sort(key=lambda x: x['influence_score'], reverse=True)
    
    return jsonify({
        'top_spreaders': spreaders[:limit],
        'total_users': len(spreaders)
    })
