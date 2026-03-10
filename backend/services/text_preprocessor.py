"""
Text Preprocessing Service
Handles cleaning and normalizing social media post text for ML analysis.
"""
import re
import html
import unicodedata


class TextPreprocessor:
    """
    Cleans and normalizes social media text for downstream NLP tasks.
    
    Pipeline:
    1. Decode HTML entities
    2. Remove URLs
    3. Remove mentions and hashtags (optionally)
    4. Normalize whitespace and punctuation
    5. Basic normalization
    """
    
    # Regex patterns compiled once for efficiency
    URL_PATTERN = re.compile(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+')
    MENTION_PATTERN = re.compile(r'@\w+')
    HASHTAG_PATTERN = re.compile(r'#(\w+)')
    MULTIPLE_SPACES = re.compile(r'\s+')
    SPECIAL_CHARS = re.compile(r'[^\w\s!?.,:;\'"-]')
    REPEATED_CHARS = re.compile(r'(.)\1{3,}')  # e.g., "sooooo" -> "soo"
    
    def clean(self, text: str, 
              remove_mentions: bool = True,
              remove_urls: bool = True,
              keep_hashtags_text: bool = True) -> str:
        """
        Full cleaning pipeline for a single text string.
        
        Args:
            text: Raw social media post text
            remove_mentions: Whether to remove @user mentions
            remove_urls: Whether to remove URLs
            keep_hashtags_text: If True, keep hashtag words without the #
            
        Returns:
            Cleaned text string
        """
        if not isinstance(text, str) or not text.strip():
            return ""
        
        # 1. Decode HTML entities (e.g., &amp; -> &)
        text = html.unescape(text)
        
        # 2. Normalize unicode (handle special characters)
        text = unicodedata.normalize('NFKC', text)
        
        # 3. Remove URLs
        if remove_urls:
            text = self.URL_PATTERN.sub(' ', text)
        
        # 4. Handle mentions
        if remove_mentions:
            text = self.MENTION_PATTERN.sub(' ', text)
        
        # 5. Handle hashtags
        if keep_hashtags_text:
            # Keep hashtag text without the # symbol
            text = self.HASHTAG_PATTERN.sub(r'\1', text)
        else:
            text = self.HASHTAG_PATTERN.sub(' ', text)
        
        # 6. Collapse repeated characters (sooooo -> soo)
        text = self.REPEATED_CHARS.sub(r'\1\1', text)
        
        # 7. Normalize whitespace
        text = self.MULTIPLE_SPACES.sub(' ', text).strip()
        
        return text
    
    def clean_batch(self, texts: list, **kwargs) -> list:
        """Clean a list of text strings."""
        return [self.clean(t, **kwargs) for t in texts]
    
    def extract_features(self, text: str) -> dict:
        """
        Extract linguistic features for bot detection and analysis.
        
        Returns dict of features like exclamation count, caps ratio, etc.
        """
        if not text:
            return {}
        
        return {
            'char_count': len(text),
            'word_count': len(text.split()),
            'exclamation_count': text.count('!'),
            'question_count': text.count('?'),
            'caps_ratio': sum(1 for c in text if c.isupper()) / max(len(text), 1),
            'url_count': len(self.URL_PATTERN.findall(text)),
            'mention_count': len(self.MENTION_PATTERN.findall(text)),
            'hashtag_count': len(self.HASHTAG_PATTERN.findall(text)),
            'has_urgency_words': any(w in text.lower() for w in [
                'share', 'urgent', 'breaking', 'deleted', 'censored', 
                'wake up', 'must see', 'before its gone'
            ])
        }


# Singleton instance
preprocessor = TextPreprocessor()
