from controllers.match_controller import User, calculate_similarity
from datetime import datetime, timedelta
from models.diary import DiaryEntryResponse

def test_user_init():
    user = User(1)
    assert user.id == 1
    assert user.posting_frequency == 0.0
    assert user.like_count == 0
    assert user.mood_scores == []
    assert user.avg_mood_score == 0.0

def test_calculate_posting_frequency():
    user = User(1)
    user.diary_entries = [
        DiaryEntryResponse(id=1, user_id=1, title="Entry 1", content="Content 1", image_url=None, is_public=True, date="2023-01-01", created_at="2023-01-01T00:00:00", updated_at="2023-01-01T00:00:00", email="user@example.com"),
        DiaryEntryResponse(id=2, user_id=1, title="Entry 2", content="Content 2", image_url=None, is_public=True, date="2023-01-03", created_at="2023-01-03T00:00:00", updated_at="2023-01-03T00:00:00", email="user@example.com"),
        DiaryEntryResponse(id=3, user_id=1, title="Entry 3", content="Content 3", image_url=None, is_public=True, date="2023-01-05", created_at="2023-01-05T00:00:00", updated_at="2023-01-05T00:00:00", email="user@example.com")
    ]
    user.calculate_posting_frequency()
    assert user.posting_frequency == 0.6  # 3 entries over 5 days

def test_get_all_keywords():
    user = User(1)
    user.diary_entries = [
        DiaryEntryResponse(id=1, user_id=1, title="Entry 1", content="Today is a good day", image_url=None, is_public=True, date="2023-01-01", created_at="2023-01-01T00:00:00", updated_at="2023-01-01T00:00:00", email="user@example.com"),
        DiaryEntryResponse(id=2, user_id=1, title="Entry 2", content="I love programming", image_url=None, is_public=True, date="2023-01-02", created_at="2023-01-02T00:00:00", updated_at="2023-01-02T00:00:00", email="user@example.com"),
        DiaryEntryResponse(id=3, user_id=1, title="Entry 3", content="Python is awesome", image_url=None, is_public=True, date="2023-01-03", created_at="2023-01-03T00:00:00", updated_at="2023-01-03T00:00:00", email="user@example.com")
    ]
    keywords = user.get_all_keywords()
    assert "today" in keywords
    assert "good" in keywords
    assert "love" in keywords
    assert "programming" in keywords
    assert "python" in keywords
    assert "awesome" in keywords
    assert "is" not in keywords  # Common words should be excluded

def test_calculate_similarity():
    user1 = User(1)
    user2 = User(2)
    
    user1.posting_frequency = 0.5
    user2.posting_frequency = 0.7
    
    user1.like_count = 10
    user2.like_count = 15
    
    user1.weather_counts = {'sunny': 5, 'cloudy': 3, 'rainy': 2}
    user2.weather_counts = {'sunny': 4, 'cloudy': 4, 'rainy': 1}
    
    user1.mood_scores = [7.0, 8.0, 7.5]
    user2.mood_scores = [6.0, 7.0, 6.5]
    user1.calculate_avg_mood_score()
    user2.calculate_avg_mood_score()
    
    similarity = calculate_similarity(user1, user2)
    assert 0 <= similarity <= 1  # Similarity should be between 0 and 1

def test_calculate_similarity_with_target_keyword():
    user1 = User(1)
    user2 = User(2)
    
    user1.diary_entries = [DiaryEntryResponse(id=1, user_id=1, title="Entry 1", content="I love olympic games", image_url=None, is_public=True, date="2023-01-01", created_at="2023-01-01T00:00:00", updated_at="2023-01-01T00:00:00", email="user1@example.com")]
    user2.diary_entries = [DiaryEntryResponse(id=2, user_id=2, title="Entry 2", content="Olympic athletes are amazing", image_url=None, is_public=True, date="2023-01-01", created_at="2023-01-01T00:00:00", updated_at="2023-01-01T00:00:00", email="user2@example.com")]
    
    similarity_with_keyword = calculate_similarity(user1, user2, target_keyword="olympic")
    similarity_without_keyword = calculate_similarity(user1, user2)
        
    assert similarity_with_keyword > 0  # Should have similarity due to target keyword
    assert 0 <= similarity_with_keyword <= 1  # Similarity should be between 0 and 1
    assert similarity_with_keyword > similarity_without_keyword  # Should have higher similarity with target keyword