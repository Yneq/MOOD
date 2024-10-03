# Mood Exchange Diary
<img width="1248" alt="Screenshot 2024-09-03 at 6 56 07 PM" src="https://github.com/user-attachments/assets/66630cb8-d659-41a5-b3e3-4a3eec6fe175">

<img width="1213" alt="Screenshot 2024-09-03 at 6 57 01 PM" src="https://github.com/user-attachments/assets/4acd07a2-6f4b-4ee8-a5bc-445cde31057b">

<img width="1335" alt="Screenshot 2024-09-02 at 12 33 10 PM" src="https://github.com/user-attachments/assets/57f37141-2f59-4fbe-bfdd-7bab9519f53d">

# Journals unlock inner thoughts.

Table of Contents
1. User Stories
2. Project Description
3. Key Features
4. Tech Stack
5. System Architecture
6. Database Schema
7. Key Algorithm: User Matching
8. Unit Testing
9. Installation and Setup
10. API Documentation
11. Contributing

## User Stories

- Exchange diaries with strangers
- Gain fresh perspectives
- Receive emotional support
- Engage in self-reflection
- Experience mental refreshment


## Project Description

Mood Exchange Diary is a platform that allows users to write and exchange diaries in real-time, fostering self-reflection and emotional support through shared experiences.


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
- FastAPI (with RESTful API)
- MySQL
- MVC-style architecture

### Frontend
- HTML
- CSS (with media queries for RWD)
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
- Redis-Cache

### Deployment
- Docker
- Nginx
- AWS-Load Balancer
- AWS-Auto Scaling
  
## System Architecture
1. **Client**: Users access the system through various devices (mobile, tablet, desktop).
2. **Domain Resolution**: AWS Route 53 for routing user requests.
3. **Load Balancing**: AWS Load Balancer distributes traffic across multiple Amazon EC2 instances.
4. **Application Layer**: 
   - Nginx as a reverse proxy server on Amazon EC2 instances
   - Backend services written in Python with FastAPI, providing RESTful APIs for user authentication, diary management, and mood tracking
   - WebSocket support for real-time bidirectional communication
   - Containerized with Docker for easy deployment and scaling
5. **Database**: AWS RDS (MySQL) for data storage
6. **Content Delivery**: AWS CloudFront CDN for global content delivery, with static assets stored in Amazon S3

<img width="681" alt="Screenshot 2024-09-18 at 7 26 02 PM" src="https://github.com/user-attachments/assets/79abe1e7-c481-447f-9763-1df62a184547">

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

Data Collection:
- User diary entries, posting frequency, likes, weather preferences, mood scores
- Similarity Calculation (calculate_similarity):
   1. Keyword similarity in diary content
   2. Posting frequency alignment
   3. Like count balancing
   4. Weather preference matching
   5. Mood score complementation
- Weighted Factors:
  Carefully calibrated for comprehensive matching
- Matching Process:
  daily_matching function applies similarity algorithm for optimal pairing
- Holistic Approach:
  Considers writing habits, emotional states, and environmental preferences
  Aims for meaningful diary exchange experiences


### Unit Testing
This project implements a comprehensive unit testing strategy to ensure code quality and functional correctness. We use Python's pytest framework for testing.
Test Coverage
Our unit tests cover the following key components:

Initialization and methods of the User class
The calculate_similarity function
Diary entry-related functionalities
Matching algorithm

Key Test Cases
Here's an overview of some crucial test cases:

1. test_user_init(): Validates the correct initialization of User objects.
2. test_calculate_posting_frequency(): Checks the logic for calculating posting frequency.
3. test_get_all_keywords(): Ensures correct keyword extraction from diary entries.
4. test_calculate_similarity(): Tests the user similarity calculation functionality.
5. test_calculate_similarity_with_target_keyword(): Verifies the impact of target keywords on similarity calculation.

By maintaining and expanding our test suite, we are committed to ensuring the stability and reliability of the project.

### Installation and Setup
Visit https://vancenomad.life/ to use the application.

### API Documentation
Our application provides a set of RESTful APIs for attraction search, booking management, and payment processing. To explore the available API routes, you can access our API documentation in the following way:
Visit our API documentation page at:
https://vancenomad.life/docs

### Contributing
We welcome contributions of all forms! Please see our CONTRIBUTING.md file for more information on how to get started.

###License
This project is licensed under the MIT License. See the LICENSE file for details.
