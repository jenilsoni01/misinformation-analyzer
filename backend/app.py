"""
Misinformation Propagation Analyzer - Flask Application Entry Point
"""
import os
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

from extension import db
# Load environment variables
load_dotenv()

# Initialize SQLAlchemy

def create_app():
    """Application factory pattern for Flask."""
    app = Flask(__name__)
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(backend_dir, '..'))
    
    # Configuration
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///misinformation.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    upload_folder = os.getenv('UPLOAD_FOLDER') or os.path.join(project_root, 'data', 'uploads')
    app.config['UPLOAD_FOLDER'] = os.path.abspath(upload_folder)
    app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_CONTENT_LENGTH', 16 * 1024 * 1024))
    
    # Initialize extensions
    db.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(os.path.join(project_root, 'models'), exist_ok=True)
    
    # Register blueprints
    from routes.dataset_routes import dataset_bp
    from routes.analysis_routes import analysis_bp
    from routes.network_routes import network_bp
    
    app.register_blueprint(dataset_bp, url_prefix='/api')
    app.register_blueprint(analysis_bp, url_prefix='/api')
    app.register_blueprint(network_bp, url_prefix='/api')
    
    # Create database tables
    with app.app_context():
        from models import database_models
        db.create_all()
        print("Database tables created.")
    
    @app.route('/api/health')
    def health_check():
        return {'status': 'healthy', 'version': '1.0.0'}
    
    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=os.getenv('FLASK_DEBUG', 'True') == 'True', port=5000)
