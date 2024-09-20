let messages = [];
let currentUserName = localStorage.getItem('user_name') || 'Anonymous';

async function loadMessages(userId = null) {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };

        let url = '/api/v1/messages';
        if (userId !== null) {
            url += `?current_user_id=${userId}`;
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        messages = await response.json();
        renderMessages();
    } catch (error) {
        document.getElementById('messages').innerHTML = '<p>MESSAGE LOADED FAILED, PLEASE TRY AGAIN LATER</p>';
    }
}
// loadMessages();

function renderMessages() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = ''; // 清空現有留言

    if (!Array.isArray(messages) || messages.length === 0) {
        messagesDiv.innerHTML = '<p>NO MOODs</p>';
        return;
    }

    messages.forEach(message => {
        if (!message || typeof message !== 'object' || !message.id) {
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
            this.style.display = 'none';
        };
        messageDiv.appendChild(img);
    }

    if (message.created_at) {
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';

    // 檢查 message.created_at 是否是字串
    if (typeof message.created_at === 'string') {
        // 直接解析 ISO 格式的時間戳
        const date = new Date(message.created_at);

        // 檢查日期是否有效
        if (!isNaN(date.getTime())) {
            // 將日期轉換為台灣時間（UTC+8）
            const taiwanDate = new Date(date.getTime() + (8 * 60 * 60 * 1000));
            
            timestampSpan.textContent = taiwanDate.toLocaleString('zh-TW', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        } else {
            timestampSpan.textContent = '無效的日期';
        }
    } else {
        timestampSpan.textContent = '無效的日期格式';
    }

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
        if (!token){
            showLoginModal();
            return
        }
        const response = await fetch(`/api/v1/messages/${messageId}/likes`, {
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
        if (!token) {
            showMessage('Please sign in first', 'error');
            return
        }
        showMessage('Renew Like failed', 'error');
    }
}

function getUserDisplayName(message) {
    if (message.email === localStorage.getItem('email')) {
        return localStorage.getItem('user_name') || 'Anonymous';
    }
    // 否則使用消息中的 user_name 或 'Anonymous'
    return message.user_name || 'Anonymous';
}

// 頁面加載時調用
document.addEventListener('DOMContentLoaded', () => loadMessages());

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
            const presignedUrlResponse = await fetch('/api/v1/presigned_urls', {
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
            alert('UPLOAD PICTURE FAILED, PLEASE TRY AGAIN LATER。');
            submitButton.disabled = false;
            return;
        }
    }

    try {
        const token = localStorage.getItem('token');

        if (!token) {
            showMessage('Please Sign-in first', 'error')
            submitButton.disabled = false;  // 重要：如果未登錄，立即重新啟用按鈕
            return
        }

        const response = await fetch('/api/v1/messages', {
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
        showMessage('Share MOODs Successfully!', 'success')
    } catch (error) {
        showMessage('An error occurred. Please try again.', 'error');
    } finally {
        // 確保在所有情況下都重新啟用按鈕
        submitButton.disabled = false;
    }
});

async function deleteMessage(messageId) {
    if (!messageId) {
        return;
    }
    if (!confirm('Are you sure you want to delete this diary entry? This action cannot be undone')) {
        return; // 如果用戶取消，則不執行刪除操作
    }
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/v1/messages/${messageId}`, {
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
        if (error.message.includes("You don't have permission")) {
            showMessage('You don\'t have permission to delete this message', 'error');
        } else if (error.message.includes("Message not found")) {
            showMessage('Message not found or already deleted', 'error');
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

function showLoginModal() {
    modal_login.style.display = "block";
    overlay.style.display = "block";

    const loginEmailInput = document.querySelector('input[name="login-email"]');
    const loginPasswordInput = document.querySelector('input[name="login-password"]');
    const testAccountHint = document.querySelector('.test-account-hint');

    if (loginEmailInput && loginPasswordInput) {
        loginEmailInput.value = 'test@test.com';
        loginPasswordInput.value = 'test';

        if (testAccountHint) {
            testAccountHint.style.display = 'block';

            setTimeout(() =>{
                testAccountHint.style.display = 'none'
            }, 3000)
        }
    }
}

const modal_login = document.getElementById('modal-login');
const overlay = document.querySelector('.overlay');


document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed');
    await updateUserDisplay();

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

    const moodsExchangeBtn = document.getElementById('moodsExchangeBtn');
    if (moodsExchangeBtn) {
        moodsExchangeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (isLoggedIn) {
                window.location.href = '/static/match.html';
            } else {
                showLoginModal(); // 未登入，顯示登入框
            }
        });
    }

    const startMyMoodsBtn = document.getElementById('startMyMoodsBtn');
    if (startMyMoodsBtn) {
        startMyMoodsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (isLoggedIn) {
                window.location.href = '/static/diary.html';
            } else {
                showLoginModal();
            }
        });
    }

    // 用戶認證相關變量
    const modal_signup = document.getElementById('modal-signup');
    const loginBtn = document.getElementById('loginBtn');
    const closeBtn = document.querySelectorAll('.close-btn');
    const q_loginBtn = document.getElementById('q-login');
    const q_signupBtn = document.getElementById('q-signup');
    const loginRegisterBtn = document.getElementById('login-register-btn');
    const signupRegisterBtn = document.getElementById('signup-register-btn');
    const userAvatar = document.getElementById('userAvatar');


    let isLoggedIn = !!localStorage.getItem('token');

    const isBoardPage = window.location.pathname.includes('board.html');

    
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


async function logout() {
    isLoggedIn = false;
    localStorage.clear();
    await updateUserDisplay();
    loadMessages();  // 重新加載留言
    if (userAvatar) {
        userAvatar.style.display = 'none';
        }
    overlay.style.display = 'none';

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
        return;
    }

    const name = signupnameInput.value.trim();
    const email = signupemailInput.value.trim();
    const password = signuppasswordInput.value.trim();

    if (!name || !email || !password) {
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
    });
}

function handleLogin() {
    const loginemailInput = document.querySelector('input[name="login-email"]');
    const loginpasswordInput = document.querySelector('input[name="login-password"]');

    if (loginemailInput && loginpasswordInput) {
        const email = loginemailInput.value;
        const password = loginpasswordInput.value;

        fetch('/api/user/auth', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        })
        .then(response => response.json())
        .then(async data => {
            if (data.error) {
                showMessage(data.message || 'Login failed, please try again later', 'error');
            } else if (data.token) {
                localStorage.setItem('token', data.token);
                isLoggedIn = true;  // 立即更新登錄狀態
                // 解析 token 並保存用戶信息
                const tokenPayload = parseJwt(data.token);
                if (tokenPayload) {
                    if (tokenPayload.name) {
                        localStorage.setItem('user_name', tokenPayload.name);
                    }
                    if (tokenPayload.email) {
                        localStorage.setItem('email', tokenPayload.email);
                    }
                    if (tokenPayload.id) {
                        localStorage.setItem('user_id', tokenPayload.id);
                    }
                }

                await updateUserDisplay();
                loadMessages();  // 重新加載留言
                showMessage('Sign in successfully', 'success');
                setTimeout(() => {
                    closeModals();
                }, 2000);
            } else {
                showMessage('Login failed, please try again later', 'error');
            }
        })
        .catch(error => {
            showMessage('An error occurred, please try again later', 'error');
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

//編輯個人資料

const userProfileModal = document.getElementById('user-profile-modal');
const profileForm = document.getElementById('profile-form');
const avatarUpload = document.getElementById('avatar-upload');
const avatarPreview = document.getElementById('avatar-preview');
const changePasswordBtn = document.getElementById('change-password-btn');
const passwordFields = document.getElementById('password-fields');

    if (userAvatar && avatarPreview) {
        try {
            const avatarUrl = await loadUserAvatar();
            if (avatarUrl) {
                userAvatar.style.backgroundImage = `url('${avatarUrl}')`;
                avatarPreview.style.backgroundImage = `url('${avatarUrl}')`;
                userAvatar.textContent = '';
                avatarPreview.textContent = '';
            } else {
                // 如果沒有頭像，顯示默認圖片或名字首字母
                const currentUserName = localStorage.getItem('user_name');
                if (currentUserName) {
                    userAvatar.textContent = currentUserName.charAt(0).toUpperCase();

                } else {
                    // 如果連用戶名也沒有，可以設置一個默認圖片
                    userAvatar.style.backgroundImage = '';
                    avatarPreview.style.backgroundImage = '';
                }
            }
        } catch (error) {
            console.error('Error setting user avatar:', error);
        }
    } else {
        console.error('userAvatar or avatarPreview element not found');
    }


function clearPasswordFields() {
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
}

function resetPasswordChangeUI() {
    const passwordFields = document.getElementById('password-fields');
    const changePasswordBtn = document.getElementById('change-password-btn');
    
    if (passwordFields) {
        passwordFields.style.display = 'none';
    }
    if (changePasswordBtn) {
        changePasswordBtn.textContent = 'Change Password';
    }
}

async function loadUserAvatar(targetUserId = null) {
    try {
        const token = localStorage.getItem('token');
        const currentUserId = localStorage.getItem('user_id');

        if (!token || !currentUserId) {
            return;
        }

        const userId = targetUserId || currentUserId;
        const url = `/api/v1/users/${userId}/avatar`

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const userData = await response.json();

        if (userData && userData.avatar_url) {
            const userAvatar = document.getElementById('userAvatar');
            if (userAvatar) {
                userAvatar.style.backgroundImage = `url('${userData.avatar_url}')`;
                userAvatar.textContent = '';
            }
            return userData.avatar_url;
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => loadUserAvatar());



if (userAvatar) {
    userAvatar.addEventListener('click', function() {
        if (userProfileModal) {
            userProfileModal.style.display = 'block';
            overlay.style.display = 'block';
            clearPasswordFields();
            resetPasswordChangeUI();
        }
    });
}

if (closeBtn && closeBtn.length > 0) {
    closeBtn.forEach(btn => {
        btn.addEventListener('click', function() {
            if (userProfileModal) {
                userProfileModal.style.display = 'none';
            }
        });
    });
}

// 頭像預覽
avatarUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            avatarPreview.src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
});

// 顯示/隱藏密碼欄位
changePasswordBtn.addEventListener('click', function() {
    passwordFields.style.display = passwordFields.style.display === 'none' ? 'block' : 'none';
});

const selfIntroElement = document.getElementById('self-intro');
if (selfIntroElement) {
    const savedSelfIntro = localStorage.getItem('selfIntro');
    if (savedSelfIntro) {
        selfIntroElement.value = savedSelfIntro;
    }

    selfIntroElement.addEventListener('input', function() {
        localStorage.setItem('selfIntro', this.value);
    });
}


if (profileForm) {
    profileForm.addEventListener('submit', async function(e) {
        e.preventDefault();

    const submitButton = this.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const avatarFile = document.getElementById('avatar-upload').files[0];
    const selfIntro = document.getElementById('self-intro').value;  // 獲取 self-intro 的值

    
    const formData = new FormData(this);
    formData.delete('self_intro');  //存localstorage，不發送後端
    
    let requestBody = {
        self_intro: selfIntro
    };

    if (newPassword || confirmPassword) {
        // 確保新密碼與確認密碼匹配
        if (newPassword !== confirmPassword) {
            showMessage('The new password and confirmation password do not match.', 'error');
            submitButton.disabled = false;
            return;
        }
        // 確保提供了當前密碼
        if (!currentPassword) {
            showMessage('Please provide the current password to change the password.', 'error');
            submitButton.disabled = false;
            return;
        }
        // 添加密碼相關欄位到請求體
        requestBody.current_password = currentPassword;
        requestBody.new_password = newPassword;
    }

    let avatarUrl = '';
    if (avatarFile) {
        try {
            // 獲取預簽名 URL
            const presignedUrlResponse = await fetch('/api/v1/presigned_urls', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename: avatarFile.name }),
            });
            const { url: presignedUrl, cloudfront_url } = await presignedUrlResponse.json();

            // 上傳圖片到 S3
            await fetch(presignedUrl, {
                method: 'PUT',
                body: avatarFile,
                headers: {
                    'Content-Type': avatarFile.type,
                },
            });

            avatarUrl = cloudfront_url;
        } catch (error) {
            showMessage( 'Upload avatar failed', 'error');
            submitButton.disabled = false;
            return;
        }
    }

    try {

        const token = localStorage.getItem('token');

        if (!token) {
            showMessage('Please signin first', 'error');
            return;
        }

        const requestBody = {
            self_intro: selfIntro
        };

        if (avatarUrl) {
            requestBody.avatar_url = avatarUrl;
        }

        if (newPassword) {
            requestBody.current_password = currentPassword;
            requestBody.new_password = newPassword;
        }


        const response = await fetch('/api/v1/users/profile', {
            method: 'PATCH',
            body: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        
        if (!response.ok) {
            showMessage((result.message || 'Update profile failed'), 'error');

            if (result.message.includes("password")) {
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            }                
            return;
        }
        
        if (result.success) {
            localStorage.setItem('selfIntro', selfIntro);
            showMessage('Update profile successfully', 'success');

            if (result.avatar_url) {
                const userAvatar = document.getElementById('userAvatar');
                const avatarPreview = document.getElementById('avatar-preview');
                if (userAvatar) {
                    userAvatar.style.backgroundImage = '';
                    userAvatar.style.backgroundImage = `url('${result.avatar_url}')`;
                    avatarPreview.style.backgroundImage = `url('${result.avatar_url}')`;
                    
                } else {
                    console.error('userAvatar element not found');
                }
            } else {
                console.log('No avatar_url in the result');
            }
        } else {
            showMessage((result.message || 'Update profile failed'), 'error');
        }

    } catch (error) {
        showMessage((error.message || 'Update profile failed'), 'error');
    } finally {
        submitButton.disabled = false;
    }
});
}

}); //DOM 尾部=======================


// TODO: 實現 WebSocket 連接後，在接收到新消息時調用此函數
function handleNewMessage(message) {
if (!messages.some(m => m.id === message.id)) {
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


const selfIntroElement = document.getElementById('self-intro');
const avatarPreview = document.getElementById('avatar-preview');

async function updateUserDisplay() {
    const isLoggedIn = !!localStorage.getItem('token');

    if (!isLoggedIn) {
        // 如果未登錄，清除所有用戶相關顯示
        if (userAvatar) {
            userAvatar.style.backgroundImage = '';
            userAvatar.textContent = '';
            userAvatar.style.display = 'none';
        }
        if (selfIntroElement) {
            selfIntroElement.value = '';
        }
        if (avatarPreview) {
            avatarPreview.style.backgroundImage = '';
        }
        if (loginBtn) {
            loginBtn.textContent = 'Sign in';
        }
        localStorage.removeItem('avatarUrl');
        return;
    }

    try {
        const response = await fetch('/api/v1/users/profile', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            
            // 更新自我介紹
            if (selfIntroElement) {
                selfIntroElement.value = data.self_intro || '';
                localStorage.setItem('selfIntro', data.self_intro || '');
            }
            
            // 更新頭像
            const avatarUrl = data.avatar_url;
            localStorage.setItem('avatarUrl', avatarUrl || '');
            if (userAvatar) {
                if (avatarUrl) {
                    userAvatar.style.backgroundImage = `url('${avatarUrl}')`;
                    userAvatar.textContent = '';
                    userAvatar.style.display = 'flex';
                } else {
                    const userName = localStorage.getItem('user_name');
                    if (userName) {
                        userAvatar.style.backgroundImage = '';
                        userAvatar.textContent = userName.charAt(0).toUpperCase();
                        userAvatar.style.display = 'flex';
                    } else {
                        userAvatar.style.backgroundImage = '';
                        userAvatar.textContent = '';
                        userAvatar.style.display = 'none';
                    }
                }
            }
            
            if (avatarPreview) {
                avatarPreview.style.backgroundImage = avatarUrl ? `url('${avatarUrl}')` : '';
            }
            
            // 更新登錄按鈕
            if (loginBtn) {
                loginBtn.textContent = 'Sign out';
            }
        } else {
            console.error('Failed to fetch user profile');
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
    }
}

function handleLogout() {
    localStorage.clear();
    if (window.matchWebSocket) {
        window.matchWebSocket.close();
    }
    isLoggedIn = false;
    updateUserDisplay();
    if (userAvatar) {
        userAvatar.style.display = 'none';
    }
    // 如果在需要登錄的頁面上登出，重定向到首頁
    const currentPage = window.location.pathname;
    if (currentPage.includes('diary.html')) {
        window.location.href = '/static/index.html';
    }
}
