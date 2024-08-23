
// 立即執行的登錄檢查
(function() {
    const isLoggedIn = !!localStorage.getItem('token');
    const isBoardPage = window.location.pathname.includes('board.html');
    
    if (isBoardPage && !isLoggedIn) {
        window.location.href = '/static/index.html';
    }
})();

let messages = [];
let currentUserName = localStorage.getItem('user_name') || 'Anonymous';

async function loadMessages() {
    try {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch('/get_messages', { headers });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        messages = await response.json();
        console.log("Received messages:", messages);  // 添加這行來查看接收到的數據

        renderMessages();
    } catch (error) {
        console.error('Error loading messages:', error);
        document.getElementById('messages').innerHTML = '<p>MESSAGE LOADED FAILED, PLEASE TRY AGAIN LATER</p>';
    }
}
// loadMessages();

function renderMessages() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; // 清空現有留言

    if (!Array.isArray(messages) || messages.length === 0) {
        console.log("No messages to render or messages is not an array");
        messagesDiv.innerHTML = '<p>NO MOODs</p>';
        return;
    }

    messages.forEach(message => {
        console.log("Rendering message:", message);
        if (!message || typeof message !== 'object' || !message.id) {
            console.error("Invalid message object:", message);
            return; // 跳過無效的訊息
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.dataset.id = message.id;

         // 使用後端的用戶名
        const userSpan = document.createElement('span');
        userSpan.className = 'user-identifier';
        userSpan.textContent = getUserDisplayName(message) + ': ';
        messageDiv.appendChild(userSpan);

        if (message.text) {
            const textP = document.createElement('p');
            textP.textContent = message.text;
            messageDiv.appendChild(textP);
        }
        
        if (message.imageUrl && message.imageUrl.trim() !== '') {
        const img = document.createElement('img');
        img.src = message.imageUrl;
        img.alt = `Image uploaded by ${message.user_name || Anonymous}`;
        img.onerror = function() {
            console.error('Failed to load image:', message.imageUrl);
            this.style.display = 'none';
        };
        messageDiv.appendChild(img);
    }

    if (message.created_at) {
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = new Date(message.created_at).toLocaleString();
        messageDiv.appendChild(timestampSpan);

        const messageFooter = document.createElement('div');
        messageFooter.className = 'message-footer';
        // 添加愛心按鈕
        const likeButton = document.createElement('button');
        likeButton.className = 'like-button';
        likeButton.innerHTML = '&#9829;'
        if (message.is_liked_by_user) {
            likeButton.classList.add('liked');
        }
        likeButton.onclick = (e) => {
            e.preventDefault();
            toggleLike(message.id);
        };
        messageFooter.appendChild(likeButton);

        // 添加點讚數
        const likeCount = document.createElement('span');
        likeCount.className = 'like-count';
        likeCount.textContent = message.like_count || 0;
        messageDiv.appendChild(likeCount);
        messageDiv.appendChild(messageFooter);

    }
        // 只有當消息屬於當前用戶時，才添加刪除按鈕
        if (message.email === localStorage.getItem('email')) {
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'DELETE';
            deleteButton.className = 'delete-button';
            deleteButton.dataset.id = message.id;

            deleteButton.onclick = (e) => {
                e.preventDefault();
                deleteMessage(message.id);
            };
            messageDiv.appendChild(deleteButton);
        }

        messagesDiv.appendChild(messageDiv);
    });
}

//like button
async function toggleLike(messageId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/toggle_like/${messageId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('無法切換按讚狀態');
        }

        const data = await response.json();

        // 更新本地消息數據
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
            messages[messageIndex].is_liked_by_user = data.liked;
            messages[messageIndex].like_count = data.liked 
                ? (messages[messageIndex].like_count || 0) + 1 
                : (messages[messageIndex].like_count || 1) - 1;
        }
        
        // 更新 UI
        const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
        if (messageElement) {
            const likeButton = messageElement.querySelector('.like-button');
            const likeCount = messageElement.querySelector('.like-count');
            
            if (likeButton) {
                if (data.liked) {
                    likeButton.classList.add('liked');
                } else {
                    likeButton.classList.remove('liked');
                }
            }
            
            if (likeCount) {
                likeCount.textContent = messages[messageIndex].like_count;
            }
        }

        showMessage(data.liked ? 'Like' : 'Dislike', 'success');
    } catch (error) {
        console.error('切換按讚狀態時發生錯誤:', error);
        showMessage('Renew Like failed', 'error');
    }
}

function getUserDisplayName(message) {
    if (message.email === localStorage.getItem('email')) {
        return currentUserName;
    }
    // 否則使用消息中的 user_name 或 'Anonymous'
    return message.user_name || 'Anonymous';
}

// 頁面加載時調用
document.addEventListener('DOMContentLoaded', loadMessages);

let lastSubmitTime = 0;
const SUBMIT_COOLDOWN = 5000; // 5 seconds

document.getElementById('postForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const submitButton = this.querySelector('button[type="submit"]');
    const now = Date.now();
    const timeElapsed = now - lastSubmitTime;

    if (timeElapsed < SUBMIT_COOLDOWN) {
        const remainingTime = Math.ceil((SUBMIT_COOLDOWN - timeElapsed) / 1000);
        showMessage(`PLEASE WAIT${remainingTime}SECONDS`, 'error');
        return;
    }
    
    submitButton.disabled = true;

    const text = document.getElementById('textInput').value.trim();
    const imageFile = document.getElementById('imageInput').files[0];

    if (!text && !imageFile) {
        showMessage('RECORD YOUR MOODs OR UPLOAD A PICTURE', 'error');
        submitButton.disabled = false;
        return;
    }

    let imageUrl = '';
    if (imageFile) {
        try {
            // 獲取預簽名 URL
            const presignedUrlResponse = await fetch('/get_presigned_url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename: imageFile.name }),
            });
            const { url: presignedUrl, key, cloudfront_url } = await presignedUrlResponse.json();

            // 上傳圖片到 S3
            await fetch(presignedUrl, {
                method: 'PUT',
                body: imageFile,
                headers: {
                    'Content-Type': imageFile.type,
                },
            });

            imageUrl = cloudfront_url;
        } catch (error) {
            console.error('Error uploading image:', error);
            alert('UPLOAD PICTURE FAILED, PLEASE TRY AGAIN LATER。');
            submitButton.disabled = false;
            return;
        }
    }

    try {
        const token = localStorage.getItem('token');

        if (!token) {
            showMessage('Please sign in first', 'error');
            return;
        }

        const response = await fetch('/save_message', {
            method: 'POST',
            body: JSON.stringify({ text, imageUrl }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
                }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const savedMessage = await response.json();
        console.log('Saved message:', savedMessage); // 查看返回的消息格式

        savedMessage.user_name = currentUserName;

        messages.unshift(savedMessage);
        renderMessages();

        lastSubmitTime = now;

        // 清空表單
        this.reset();

        // 5秒後重新啟用提交按鈕
        setTimeout(() => {
            submitButton.disabled = false;
        }, SUBMIT_COOLDOWN);

    } catch (error) {
        console.error('Error saving message:', error);
        alert('Error saving message');
        submitButton.disabled = false;
    }
});

async function deleteMessage(messageId) {
    if (!messageId) {
        console.error('Invalid message ID');
        return;
    }
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/delete_message/${messageId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
                }
        });
        if (!response.ok) {
            throw new Error(errorData.detail || 'Failed to delete message');
        }
        showMessage('DELETED MOOD SUCCESSFULLY', 'success')

        // 從本地數組中移除留言並重新渲染
        messages = messages.filter(message => message.id !== messageId);
        renderMessages();
    } catch (error) {
        console.error('Error deleting message:', error);
        if (error.message.includes("You don't have permission")) {
            showMessage('You don\'t have permission to delete this message', 'error');
        } else if (error.message.includes("Message not found")) {
            showMessage('Message not found or already deleted', 'info');
            // 從本地數組中移除留言並重新渲染，以防萬一
            messages = messages.filter(message => message.id !== messageId);
            renderMessages();
        } else {
            showMessage('DELETED MOODs ERROR, PLEASE TRY AGAIN LATER', 'error');
        }
    }
}

document.getElementById('imageInput').addEventListener('change', function() {
    var fileName = this.files[0] ? this.files[0].name : 'No file chosen';
    document.getElementById('fileNameDisplay').textContent = fileName;
});


document.addEventListener('DOMContentLoaded', (event) => {
console.log('DOM fully loaded and parsed');
const token = localStorage.getItem('token');
if (token) {
    const tokenPayload = parseJwt(token);
    if (tokenPayload) {
        if (tokenPayload.name && !localStorage.getItem('user_name')) {
            localStorage.setItem('user_name', tokenPayload.name);
        }
        if (tokenPayload.email && !localStorage.getItem('email')) {
            localStorage.setItem('email', tokenPayload.email);
        }
    }
}

// 用戶認證相關變量
const modal_login = document.getElementById('modal-login');
const modal_signup = document.getElementById('modal-signup');
const loginBtn = document.getElementById('loginBtn');
const closeBtn = document.querySelectorAll('.close-btn');
const q_loginBtn = document.getElementById('q-login');
const q_signupBtn = document.getElementById('q-signup');
const overlay = document.querySelector('.overlay');
const loginRegisterBtn = document.getElementById('login-register-btn');
const signupRegisterBtn = document.getElementById('signup-register-btn');
const userAvatar = document.getElementById('userAvatar');


let isLoggedIn = !!localStorage.getItem('token');

// 檢查當前頁面
console.log('Current page:', window.location.pathname);
const isBoardPage = window.location.pathname.includes('board.html');
console.log('Is board page:', isBoardPage);

function updateUserDisplay() {
    const userName = localStorage.getItem('user_name');
    if (userName && userAvatar) {
        userAvatar.textContent = userName.charAt(0).toUpperCase();
        userAvatar.style.display = 'flex';
    }
    if (loginBtn) {
        loginBtn.textContent = isLoggedIn ? 'Sign out' : 'Sign in';
        console.log('Button text updated:', loginBtn.textContent);
    } else {
        console.error('Login button not found');
    }
}

updateUserDisplay();

// 登入按鈕事件
if (loginBtn) {
    loginBtn.onclick = function(e) {
        e.preventDefault();
        if (isLoggedIn) {
            logout();
        } else {
            showLoginModal();
        }
    };
}



function logout() {
isLoggedIn = false;
localStorage.removeItem('token');
localStorage.removeItem('user_name');
localStorage.removeItem('email');
updateUserDisplay();
if (userAvatar) {
    userAvatar.style.display = 'none';
}
console.log('Sign out');
if (isBoardPage) {
    window.location.href = '/static/index.html';
}
}

function showLoginModal() {
    modal_login.style.display = "block";
    overlay.style.display = "block";
}

closeBtn.forEach(btn => {
    btn.onclick = closeModals;
});

function closeModals() {
    modal_login.style.display = "none";
    modal_signup.style.display = "none";
    overlay.style.display = "none";
}

q_loginBtn.onclick = function() {
    modal_signup.style.display = "block";
    modal_login.style.display = "none";
};

q_signupBtn.onclick = function() {
    modal_login.style.display = "block";
    modal_signup.style.display = "none";
};

if (loginRegisterBtn) {
    loginRegisterBtn.addEventListener('click', handleLogin);
}

if (signupRegisterBtn) {
    signupRegisterBtn.addEventListener('click', handleSignup);
}

function handleSignup() {
    const signupnameInput = document.querySelector('input[name="signup-name"]');
    const signupemailInput = document.querySelector('input[name="signup-email"]');
    const signuppasswordInput = document.querySelector('input[name="signup-password"]');
    const failEmailRegisted = document.querySelector('.fail-email-registed');
    const failRegisted = document.querySelector('.fail-registed');
    const successSignupMessage = document.querySelector('.success-signup');
    

    if (!signupnameInput || !signupemailInput || !signuppasswordInput) {
        console.log('Some signup inputs are missing');
        return;
    }

    const name = signupnameInput.value.trim();
    const email = signupemailInput.value.trim();
    const password = signuppasswordInput.value.trim();

    if (!name || !email || !password) {
        console.log('Some fields are empty');
        return;
    }

    fetch('/api/user', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, email, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showMessage(data.message.includes('重複的 Email') ? 'failEmailRegisted' : 'failRegisted', 'error');
        } else if (data.ok) {
            showMessage('Registration successful, please log in to the system', 'success');
            setTimeout(() => {
                modal_signup.style.display = "none";
                modal_login.style.display = "block";
            }, 2000);
        } else {
            showMessage('Registration failed, please try again later', 'error');
        }
    })
    .catch(error => {
        showMessage('An error occurred, please try again later', 'error');
        console.log('Error', error.message);
    });
}

function handleLogin() {
    const loginemailInput = document.querySelector('input[name="login-email"]');
    const loginpasswordInput = document.querySelector('input[name="login-password"]');
    const failMessage = document.querySelector('.fail-email-password');
    const successLoginMessage = document.querySelector('.success-login');

    if (loginemailInput && loginpasswordInput) {
        const email = loginemailInput.value;
        const password = loginpasswordInput.value;

        fetch('/api/user/auth', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showMessage(data.message || 'Login failed, please try again later', 'error');
            } else if (data.token) {
                localStorage.setItem('token', data.token);
                // 解析 token 並保存用戶信息
                const tokenPayload = parseJwt(data.token);
                if (tokenPayload) {
                    if (tokenPayload.name) {
                        localStorage.setItem('user_name', tokenPayload.name);
                    }
                    if (tokenPayload.email) {
                        localStorage.setItem('email', tokenPayload.email);
                    }
                    }
                    console.log('Stored user info:', {
                        token: data.token,
                        user_name: localStorage.getItem('user_name'),
                        email: localStorage.getItem('email')
                    });
            
        
                showMessage('Sign in successfully', 'success');
                setTimeout(() => {
                    closeModals();
                    isLoggedIn = true;
                    updateUserDisplay();
                    if (isDiaryPage) {
                        window.location.reload();
                    }
                }, 2000);
            } else {
                showMessage('Login failed, please try again later', 'error');
            }
        })
        .catch(error => {
            showMessage('An error occurred, please try again later', 'error');
            console.log('Error', error);
        });
    } else {
        console.log('Email or password input not found');
    }
}
// 添加一個解析 JWT 的函數
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Error parsing JWT:', e);
        return null;
    }
}        
}); //DOM 尾部=======================

//websocket

function initializeWebSocket() {

const token = localStorage.getItem('token');
socket = new WebSocket(`${wsProtocol}//${window.location.host}/ws?token=${token}`);

socket.onopen = function(event) {
    console.log("WebSocket 連接已建立");
    const userInfo = {
        type: 'user_info',
        user_name: currentUserName,
        email: localStorage.getItem('email')
    };
    socket.send(JSON.stringify(userInfo));
};

socket.onmessage = function(event) {
    console.log("Received WebSocket message:", event.data);
    try {
        const message = JSON.parse(event.data);
        console.log("Parsed WebSocket message:", message);

        if (message && typeof message === 'object' && message.id) {
            handleNewMessage(message);
        } else {
            console.error("Invalid message received from WebSocket:", message);
        }
    } catch (error) {
        console.error("Error processing WebSocket message:", error);
    }
};
socket.onerror = function(error) {
    console.error("WebSocket ERROR:", error);
};

socket.onclose = function(event) {
    console.log("WebSocket Connect closed");
    // 可以在這裡添加重新連接的邏輯
};
}

function handleNewMessage(message) {
console.log("Handling new message:", message);
if (!messages.some(m => m.id === message.id)) {
    console.log("Adding new message to array");
    
const newMessage = {
    ...message,
    user_name: getUserDisplayName(message)
};
    messages.unshift(newMessage);
    renderMessages();
} else {
    console.log("消息已存在，不添加");
}
}

function sendMessageViaWebSocket(message) {
if (socket && socket.readyState === WebSocket.OPEN) {
    console.log("通過 WebSocket 發送消息:", JSON.stringify(message));
    socket.send(JSON.stringify(message));
} else {
    console.error("WebSocket 未連接，無法發送消息");
}
}




function showMessage(message, type = 'info') {
    const messageContainer = document.createElement('div');
    messageContainer.className = `message-container ${type}`;
    messageContainer.textContent = message;
    document.body.appendChild(messageContainer);

    setTimeout(() => {
        messageContainer.classList.add('show');
    }, 10);

    setTimeout(() => {
        messageContainer.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(messageContainer);
        }, 300);
    }, 2000);
}
