# Mood Exchange Diary

Journals unlock inner thoughts.

## Project Description

Mood Exchange Diary is a platform that allows users to write and exchange diaries in real-time, fostering self-reflection and emotional support through shared experiences.
<img width="1335" alt="Screenshot 2024-09-02 at 12 33 10 PM" src="https://github.com/user-attachments/assets/57f37141-2f59-4fbe-bfdd-7bab9519f53d">


## Key Features

- User authentication (login/logout)
- Private diary writing
- Public diary wall
- Real-time diary exchange with others
- Future diary writing to oneself
- Matching algorithm based on user interests and writing style

## Tech Stack

### Backend
- Python
- FastAPI
- MySQL
- MVC-style architecture

### Frontend
- HTML
- CSS
- JavaScript

### Authentication
- JWT (JSON Web Tokens)

### Real-time Communication
- WebSocket

### Data Storage/Security
- AWS RDS (MySQL)
- Amazon S3
- AWS CloudFront
- MySQL Connection Pool
- redis-cache
  
### Deployment
- Docker
- Nginx
- AWS-Load Balance
  
## System Architecture

1. **Client**: Users access the system through various devices (mobile, tablet, desktop).
2. **Domain Resolution**: AWS Route 53 for routing user requests.
3. **Load Balancing**: AWS Load Balancer distributes traffic across multiple Amazon EC2 instances.
4. **Application Layer**: 
   - Nginx as a reverse proxy server on Amazon EC2 instances
   - Backend services written in Python
   - WebSocket support for real-time bidirectional communication
   - Containerized with Docker for easy deployment and scaling
5. **Database**: AWS RDS (MySQL) for data storage
6. **Content Delivery**: AWS CloudFront CDN for global content delivery, with static assets stored in Amazon S3
<img width="659" alt="Screenshot 2024-08-19 at 9 06 58 PM" src="https://github.com/user-attachments/assets/4dab0f0c-dcfa-4a1b-981d-77c4bc7dc589">


## Database Schema

Our application uses a relational database with the following key tables:

### Users
- Stores user information including name, email, password, and avatar URL
- Tracks user matching status and last login time

### Diary Entries
- Contains user diary entries with title, content, date, and privacy setting
- Allows for image attachments via URL

### Mood Entries
- Records user mood scores, associated weather, and notes
- Linked to users for mood tracking over time

### Messages
- Stores messages exchanged between users
- Includes text content and optional image URLs

### Likes
- Tracks likes on messages
- Associates users with the messages they've liked

### User Matches
- Records matched pairs of users
- Includes match date and status information

### User Match Requests
- Manages match requests between users
- Tracks request status and relevant timestamps

Key Relationships:
- Users are central, connecting to diary entries, mood entries, messages, and matches
- Diary and mood entries are linked to individual users
- Messages can be liked by multiple users
- User matches and match requests establish connections between users

This schema design supports the core functionalities of our mood exchange diary application, including user interactions, diary management, mood tracking, and the matching system.

<img width="546" alt="Screenshot 2024-08-27 at 4 51 11 AM" src="https://github.com/user-attachments/assets/dce95153-f104-4f1c-8831-680139fc8731">


## Key Algorithm: User Matching

The matching algorithm pairs users based on various factors:

1. **Keyword Similarity**: Analyzes common keywords in users' diary entries.
2. **Posting Frequency**: Compares how often users write entries.
3. **Popularity**: Considers the number of likes users receive.
4. **Weather Preferences**: Matches users based on their weather-related entries.
5. **Mood Scores**: Pairs users with complementary mood patterns.

These factors are weighted to calculate an overall similarity score, which determines the best matches for diary exchanges.

## User Stories

- Exchange diaries with strangers
- Gain fresh perspectives
- Receive emotional support
- Engage in self-reflection
- Experience mental refreshment

## Installation and Setup

https://vancenomad.life/

