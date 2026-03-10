"""
Dataset Routes - Handle CSV upload and data ingestion
"""
import os
import io
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
import pandas as pd

dataset_bp = Blueprint('dataset', __name__)
logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {'post_id', 'user_id', 'post_text'}
OPTIONAL_COLUMNS = {'timestamp', 'retweet_count', 'reply_count'}


@dataset_bp.route('/upload_dataset', methods=['POST'])
def upload_dataset():
    """
    Upload a CSV dataset of social media posts.
    
    Expected CSV columns:
    - post_id (required)
    - user_id (required)  
    - post_text (required)
    - timestamp (optional)
    - retweet_count (optional)
    - reply_count (optional)
    
    Returns:
        JSON with dataset_id and summary statistics
    """
    from extension import db
    from models.database_models import Post, Dataset
    from services.text_preprocessor import preprocessor
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'Only CSV files are supported'}), 400
    
    try:
        # Read CSV
        content = file.read().decode('utf-8', errors='replace')
        df = pd.read_csv(io.StringIO(content))
        
        # Validate required columns
        missing_cols = REQUIRED_COLUMNS - set(df.columns)
        if missing_cols:
            return jsonify({
                'error': f'Missing required columns: {missing_cols}',
                'provided_columns': list(df.columns)
            }), 400
        
        # Create dataset record
        dataset = Dataset(
            filename=file.filename,
            post_count=len(df),
            status='uploaded',
            uploaded_at=datetime.utcnow()
        )
        db.session.add(dataset)
        db.session.flush()  # Get ID before commit
        
        # Process and store posts
        posts_added = 0
        errors = []
        
        for idx, row in df.iterrows():
            try:
                post_text = str(row['post_text']) if pd.notna(row['post_text']) else ''
                
                if not post_text.strip():
                    continue
                
                # Clean text
                cleaned = preprocessor.clean(post_text)
                
                # Parse timestamp
                timestamp = datetime.utcnow()
                if 'timestamp' in df.columns and pd.notna(row['timestamp']):
                    try:
                        timestamp = pd.to_datetime(row['timestamp']).to_pydatetime()
                    except:
                        pass
                
                post = Post(
                    post_id=str(row['post_id']),
                    user_id=str(row['user_id']),
                    post_text=post_text,
                    cleaned_text=cleaned,
                    timestamp=timestamp,
                    retweet_count=int(row['retweet_count']) if 'retweet_count' in df.columns and pd.notna(row.get('retweet_count')) else 0,
                    reply_count=int(row['reply_count']) if 'reply_count' in df.columns and pd.notna(row.get('reply_count')) else 0,
                    dataset_id=dataset.id
                )
                db.session.add(post)
                posts_added += 1
                
            except Exception as e:
                errors.append(f"Row {idx}: {str(e)}")
                if len(errors) > 10:  # Limit error reporting
                    break
        
        dataset.post_count = posts_added
        db.session.commit()
        
        return jsonify({
            'success': True,
            'dataset_id': dataset.id,
            'filename': file.filename,
            'posts_loaded': posts_added,
            'errors': errors[:5] if errors else [],
            'columns_found': list(df.columns),
            'message': f'Successfully loaded {posts_added} posts. Ready for analysis.'
        }), 201
        
    except pd.errors.EmptyDataError:
        return jsonify({'error': 'The CSV file is empty'}), 400
    except Exception as e:
        logger.error(f"Dataset upload error: {e}", exc_info=True)
        return jsonify({'error': f'Failed to process dataset: {str(e)}'}), 500


@dataset_bp.route('/datasets', methods=['GET'])
def list_datasets():
    """List all uploaded datasets."""
    from models.database_models import Dataset
    
    datasets = Dataset.query.order_by(Dataset.uploaded_at.desc()).all()
    return jsonify([d.to_dict() for d in datasets])


@dataset_bp.route('/datasets/<int:dataset_id>', methods=['GET'])
def get_dataset(dataset_id):
    """Get details of a specific dataset."""
    from models.database_models import Dataset, Post
    
    dataset = Dataset.query.get_or_404(dataset_id)
    
    # Sample posts preview
    posts_preview = Post.query.filter_by(dataset_id=dataset_id).limit(5).all()
    
    return jsonify({
        **dataset.to_dict(),
        'posts_preview': [p.to_dict() for p in posts_preview]
    })


@dataset_bp.route('/datasets/<int:dataset_id>', methods=['DELETE'])
def delete_dataset(dataset_id):
    """Delete a dataset and all its posts."""
    from app import db
    from models.database_models import Dataset, Post, Topic
    
    dataset = Dataset.query.get_or_404(dataset_id)
    
    Post.query.filter_by(dataset_id=dataset_id).delete()
    Topic.query.filter_by(dataset_id=dataset_id).delete()
    db.session.delete(dataset)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Dataset deleted'})
