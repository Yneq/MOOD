// 全局變量
let currentYear, currentMonth;
let ws; // WebSocket 連線
let currentPartnerId = null;
let currentMoodScore = 0;
let currentWeather = 'sunny';
let isLoggedIn = !!localStorage.getItem('token');
let isExchangeButtonDisabled = false;
let countdownInterval;
let isViewingPartnerProfile = false;




const SAVE_COOLDOWN = 5000; 
let lastSaveTime = 0;
const DELETE_COOLDOWN = 5000;
let lastDeleteTime = 0;

function initializeMatchPage() {
    const exchangeBtn = document.getElementById('exchangeBtn');
    console.log('Initializing match page');
    if (exchangeBtn) {
        if (localStorage.getItem('token') && localStorage.getItem('user_id')) {
            connectWebSocket();
        }
        exchangeBtn.addEventListener('click', handleExchangeRequest);
        checkPendingRequests();   //抓取partner名字
    }
    checkMatchStatus(); // 初始檢查
    // setInterval(checkMatchStatus, 60000); // 每分鐘檢查一次
}

async function handleExchangeRequest() {
    if (isExchangeButtonDisabled) {
        console.log('Exchange button is already disabled');
        return;
    }
    try {
        // 禁用 Exchange 按鈕
        disableExchangeButton(exchangeBtn);
        const token = localStorage.getItem('token');

        const response = await retryOperation(() => 
            fetch('/matching/request_exchange', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
            })
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data) {
            throw new Error('No data received from server');
        }
        switch (data.status){
            case 'success':
            case 'pending':
                showNotification('Your match request is on its way!');
                clearPartnerInfo(); // 清除舊的配對者信息
                updateExchangeButton(data);
                break;
            case 'no_match':
                showNotification(data.message);
                enableExchangeButton(exchangeBtn); // 允許用戶再次嘗試
                break;
            default:
                showNotification(data.message || 'Unknown status received');
                enableExchangeButton(exchangeBtn); // 如果是未知狀態，重新啟用按鈕
        }

        checkMatchStatus(); // 在所有情況下都檢查匹配狀態
    } catch (error) {
        console.error('Error:', error);
        if (error.response) {
            console.error('Error response:', await error.response.text());
        }        
        showNotification('An error occurred. Please try again later.');
        enableExchangeButton(exchangeBtn); // 如果發生錯誤，重新啟用按鈕
    }
}


const partnerDiaryContent = document.getElementById('partnerDiaryContent');

async function checkMatchStatus() {
    try {
        const response = await retryOperation(() => 
            fetch('/matching/status', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            })
        );

        const data = await response.json();
        console.log('Match status response:', data);
        
        updateExchangeButton(data);

        const partnerNameElement = document.querySelector('.partner-name');
        const exchangeBtn = document.getElementById('exchangeBtn');


        switch(data.status) {
            case 'accepted':
                // 檢查配對是否在24小時內
                console.log(`Match accepted with partner Name: ${data.partner_name}`);
                if (currentPartnerId !== data.partner_id) {
                    currentPartnerId = data.partner_id;
                    showNotification(`You've been matched with ${data.partner_name}!`);
                }
                
                if (partnerNameElement) {
                    const partnerAvatarUrl = await loadUserAvatar(data.partner_id);

                    partnerNameElement.style.backgroundImage = partnerAvatarUrl ? `url('${partnerAvatarUrl}')` : '';
                    partnerNameElement.textContent = partnerAvatarUrl ? '' : data.partner_name.charAt(0).toUpperCase();
                    partnerNameElement.style.display = 'flex';

                    const tooltip = document.getElementById('partnerNameTooltip');
                    if (tooltip) {
                        tooltip.textContent = data.partner_name;
                        partnerNameElement.onmouseover = function() {
                            tooltip.style.visibility = 'visible';
                            tooltip.style.opacity = '1';
                        };
                        partnerNameElement.onmouseout = function() {
                            tooltip.style.visibility = 'hidden';
                            tooltip.style.opacity = '0';
                        };
                    } else {
                        console.error('Partner name tooltip element not found');
                    }
                }
                // 檢查合作夥伴的日記內容
                const partnerDiary = await loadPartnerDiary(data.partner_id);
                if (partnerDiaryContent) {
                    partnerDiaryContent.innerHTML = partnerDiary || '<p>Your partner hasn\'t written any diary entries yet. Check back later!</p>';
                    }
                enableExchangeButton(exchangeBtn); //new
                break;
            case 'pending':
            case 'incoming_request':
                console.log(`Pending request: ${data.message}`);
                if (partnerDiaryContent) {
                    if (data.status === 'pending') {
                        partnerDiaryContent.innerHTML = `<p>You have a pending outgoing match request. Waiting for response...</p>`;
                    } else {
                        partnerDiaryContent.innerHTML = `<p>You have a pending incoming match request from ${data.requester_name}. Please respond!</p>`;
                    }
                }
                disableExchangeButton(exchangeBtn);
                break;
            case 'no_match':
            case 'match_expired':
                console.log(data.status, data.message);
                currentPartnerId = null;
                clearPartnerInfo(); //new
                if (partnerDiaryContent) {
                    partnerDiaryContent.innerHTML = `<p>${data.message}</p>`;
                }
                enableExchangeButton(exchangeBtn);
                break;
            default:
                console.log('No active match or default status');
                currentPartnerId = null;
                clearPartnerInfo(); //new
                if (partnerDiaryContent) {
                    partnerDiaryContent.innerHTML = `<p>${data.message}</p>`;
                }
                enableExchangeButton(exchangeBtn);
                break;
        }
    } catch (error) {
        console.error('Error in checkMatchStatus:', error);
        showNotification('Your partner\'s diary is still empty! Maybe they\'re busy exploring a magical world');
        if (partnerDiaryContent) {
            partnerDiaryContent.innerHTML = '<p>Your partner\'s diary is still empty! Maybe they\'re busy exploring a magical world</p>';
        }
        enableExchangeButton(document.getElementById('exchangeBtn'));
    }
}

function clearPartnerInfo() {
    const partnerNameElement = document.querySelector('.partner-name');
    const tooltip = document.getElementById('partnerNameTooltip');

    if (partnerNameElement) {
        partnerNameElement.style.backgroundImage = '';
        partnerNameElement.textContent = '';
        partnerNameElement.style.display = 'none';
    }

    if (tooltip) {
        tooltip.textContent = '';
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = '0';
    }
}

function disableExchangeButton(button) {
    if (button && !isExchangeButtonDisabled) {
        button.disabled = true;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
        isExchangeButtonDisabled = true;
    }
}

function enableExchangeButton(button) {
    if (button && isExchangeButtonDisabled) {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
        isExchangeButtonDisabled = false;
    }
}

function updateExchangeButton(matchData) {
    console.log('updateExchangeButton called with data:', matchData);
    const exchangeBtn = document.getElementById('exchangeBtn');
    const exchangeCountdown = document.getElementById('exchangeCountdown');

    if (!exchangeBtn || !exchangeCountdown) {
        console.log('Exchange button or countdown element not found on this page');
        return;
    }

    if (matchData.status === 'pending' || matchData.status === 'incoming_request') {
        disableExchangeButton(exchangeBtn);
        exchangeCountdown.style.display = 'block';
        startCountdown(matchData.remaining_time_seconds);
    } else {
        enableExchangeButton(exchangeBtn);
        exchangeCountdown.style.display = 'none';
        stopCountdown();
    }
}

function startCountdown(remainingTimeSeconds, status) {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    function updateCountdown() {
        const countdownTime = document.getElementById('countdownTime');
        if (remainingTimeSeconds > 0) {
            const hours = Math.floor(remainingTimeSeconds / 3600);
            const minutes = Math.floor((remainingTimeSeconds % 3600) / 60);
            const seconds = Math.floor(remainingTimeSeconds % 60);

            let countdownText = `${hours}h ${minutes}m ${seconds}s`;
            if (status === 'pending') {
                countdownText += " until request expires";
            } else if (status === 'incoming_request') {
                countdownText += " to respond";
            }
            
            countdownTime.textContent = countdownText;
            remainingTimeSeconds--;
        } else {
            stopCountdown();
            checkMatchStatus();
        }
    }

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

function stopCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    const countdownTime = document.getElementById('countdownTime');
    if (countdownTime) {
        countdownTime.textContent = '';
    }
}


async function loadPartnerDiary(partnerId) {
    console.log(`Attempting to load partner diary for partner ID: ${partnerId}`);

    try {
        const token = localStorage.getItem('token');
        const response = await retryOperation(() => 
            fetch(`/get_partner_diary/${partnerId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
        )

        if (response.status === 403) {
            // 匹配已經結束，更新 UI
            showNotification("You are no longer matched with this user");
            currentPartnerId = null;
            checkMatchStatus();
            return null; // 返回 null 表示沒有有效的日記內容
        }

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

        const responseText = await response.text();
        console.log('Response text:', responseText);

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error('Error parsing JSON:', e);
            throw new Error('Unable to parse server response');
        }

        if (!response.ok) {
            console.error('Server error response:', data);
            throw new Error(data.detail || `HTTP error! status: ${response.status}`);            
        }    

        console.log('Partner diary data:', data);


        // partnerDiaryContent.innerHTML = ''; // 清空現有內容
        let diaryContent = '';
        if (Array.isArray(data) && data.length > 0) {
            diaryContent = data.map(entry => `
                <div class="partnerdiary-entry">
                    <div class="moodsDate">${entry.date}</div>
                        <p>${entry.content}</p>

                </div>
            `).join('');
            console.log(`Rendered ${data.length} diary entries`);

        } else {
            partnerDiaryContent.innerHTML = '<p>Your partner has not written any diaries yet. Check back later!</p>';
            console.log('No diary entries found for partner');
        }

        if (partnerDiaryContent) {
            partnerDiaryContent.innerHTML = diaryContent;
        }

        return diaryContent; // 返回日記內容，即使是空的
    } catch (error) {
        console.error('Error loading partner diary:', error);
        console.error('Error stack:', error.stack);
        const errorMessage = error.message || 'Failed to load partner diary';
        showNotification(`Your partner\'s diary is still empty! Maybe they\'re busy exploring a magical world`);
        
        if (partnerDiaryContent) {
            partnerDiaryContent.innerHTML = `Your partner\'s diary is still empty! Maybe they\'re busy exploring a magical world`;
        }
    }
}

// 建立WebSocket連接

function connectWebSocket() {
    const userId = localStorage.getItem('user_id');
    if (!userId) {
        console.error('User ID not found. Unable to establish WebSocket connection.');
        return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/${userId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = function() {
        console.log('WebSocket connection established');
    };

    ws.onmessage = function(event) {
        const message = event.data;
        showNotification(message);
    };

    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };

    ws.onclose = function(event) {
        console.log('WebSocket connection closed:', event);
    };

    // 將 WebSocket 實例存儲在全局變量
    window.matchWebSocket = ws;
}
    
// 顯示通知的函數
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 在頁面加載時檢查是否有待處理的配對請求
async function checkPendingRequests() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/matching/requests', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const requests = await response.json();
        requests.forEach(request => {
            showMatchRequestNotification(request);
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

function showMatchRequestNotification(request) {
    console.log('Showing notification for request:', request);
    if (!request || !request.requester_id) {
        console.error('Invalid request object:', request);
        return;
    }
    const notification = document.createElement('div');
    notification.className = 'match-request-notification';
    notification.innerHTML = `
        <p>You have a new match with "${request.user_name || 'SECRET'}" </p>
        <button class="accept-btn" data-requester-id="${request.requester_id}">ACCEPT</button>
        <button class="reject-btn" data-requester-id="${request.requester_id}">DENY</button>
        `;

    const acceptBtn = notification.querySelector('.accept-btn');
    const rejectBtn = notification.querySelector('.reject-btn');
    
    acceptBtn.addEventListener('click', function() {
        const requesterId = this.getAttribute('data-requester-id');
        console.log('Rejecting request from requester:', requesterId);
        respondToMatchRequest(requesterId, 'accept');
    });

    rejectBtn.addEventListener('click', function() {
        const requesterId = this.getAttribute('data-requester-id');
        console.log('Rejecting request from requester:', requesterId);
        respondToMatchRequest(requesterId, 'reject');
    });


    document.body.appendChild(notification);
}

async function respondToMatchRequest(requesterId, action) {
    console.log(`Responding to request from user ${requesterId} with action ${action}`);
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/matching/respond/${requesterId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action: action })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const data = await response.json();
        console.log('Response data:', data);
        showNotification(data.message);
         // 關閉 WebSocket 連接
        if (window.matchWebSocket) {
            window.matchWebSocket.close();
        }

        // 移除通知元素
        const notification = document.querySelector('.match-request-notification');
        if (notification) {
            notification.remove();
        }
        // 如果接受了match請求，立即刷新match狀態和夥伴日記
        if (action === 'accept') {
            await checkMatchStatus();
        }
        if (action ==='reject') {
            await checkMatchStatus();
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('MATCH SYSTEM ERROR, PLEASE TRY AGAIN LATER');
    }
}

const avatarPreview = document.getElementById('avatar-preview');
const selfIntroElement = document.getElementById('self-intro');

async function updateUserDisplay() {
    const isLoggedIn = !!localStorage.getItem('token');

    if (!isLoggedIn) {
        // 如果未登錄,清除所有用戶相關顯示
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
        localStorage.removeItem('avatarUrl'); // 清除存儲的頭像 URL
        return;
    }

    try {
        const response = await fetch('/get_user_profile', {
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
            localStorage.setItem('avatarUrl', avatarUrl || ''); // 將頭像 URL 存儲在 localStorage 中
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

async function saveSelfIntro() {
    const selfIntro = selfIntroElement.value;
    try {
        const response = await fetch('/update_profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ self_intro: selfIntro })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            localStorage.setItem('selfIntro', data.self_intro);
            showMessage(document.querySelector('.success-self-info'), 'Self introduction saved successfully!');
        } else {
            showMessage(document.querySelector('.fail-self-info'), 'Failed to save self introduction. Please try again later.');
        }
    } catch (error) {
        console.error('Error saving self introduction:', error);
        showMessage(document.querySelector('.fail-self-info'), 'An error occurred while saving. Please try again.');
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
        const url = `/get_user_avatar/${userId}`

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
        console.log('Received user data:', userData);

        if (userData && userData.avatar_url) {
            return userData.avatar_url;
        } else {
            console.log('No avatar URL found in the response');
            return null;
        }
    } catch (error) {
        console.error('Error loading user avatar:', error);
        return null;
    }
}



// 初始化夥伴資料模態框
function initializePartnerModal() {
    const partnerNameElement = document.getElementById('partnerName');
    if (partnerNameElement) {
        partnerNameElement.addEventListener('click', handlePartnerNameClick);
    }
}

// 處理夥伴名稱點擊事件
function handlePartnerNameClick() {
    if (currentPartnerId) {
        openPartnerModal(currentPartnerId);
    } else {
        console.log('No partner ID available');
    }
}

// 打開夥伴資料模態框
function openPartnerModal(partnerId) {
    const userProfileModal = document.getElementById('user-profile-modal');
    const overlay = document.querySelector('.overlay');
    if (userProfileModal && overlay) {
        userProfileModal.style.display = 'block';
        overlay.style.display = 'block';
        fetchPartnerInfo(partnerId);
    }
}

function closeUserProfileModal() {
    if (userProfileModal) {
        userProfileModal.style.display = 'none';
        overlay.style.display = 'none';
        isViewingPartnerProfile = false;
    }
}

// 獲取夥伴資料
async function fetchPartnerInfo(partnerId) {
    try {
        const response = await fetch(`/get_partner_info/${partnerId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error('無法獲取夥伴資料');
        }
        const data = await response.json();
        updatePartnerModalContent(data);
    } catch (error) {
        console.error('獲取夥伴資料時發生錯誤:', error);
        showNotification('There is no partner INFO.');
    }
}

// 更新夥伴模態框內容
function updatePartnerModalContent(partnerInfo) {
    const modalTitle = document.querySelector('#user-profile-modal .log-in');
    const avatarPreview = document.getElementById('avatar-preview');
    const selfIntroElement = document.getElementById('self-intro');
    const passwordFields = document.getElementById('password-fields');
    const changePasswordBtn = document.getElementById('change-password-btn');
    const submitButton = document.querySelector('#user-profile-modal button[type="submit"]');

    if (modalTitle) modalTitle.textContent = "Partner INFO.";
    
    updatePartnerAvatar(avatarPreview, partnerInfo);
    updatePartnerSelfIntro(selfIntroElement, partnerInfo);
    hidePartnerSpecificElements(passwordFields, changePasswordBtn, submitButton);
}

function updatePartnerAvatar(avatarPreview, partnerInfo) {
    if (avatarPreview) {
        if (partnerInfo.avatar_url) {
            avatarPreview.style.backgroundImage = `url('${partnerInfo.avatar_url}')`;
            avatarPreview.textContent = '';
        } else {
            avatarPreview.style.backgroundImage = '';
            avatarPreview.textContent = partnerInfo.name.charAt(0).toUpperCase();
        }
    }
}

function updatePartnerSelfIntro(selfIntroElement, partnerInfo) {
    if (selfIntroElement) {
        selfIntroElement.value = partnerInfo.self_intro || 'There is no moods yet...';
        selfIntroElement.readOnly = true;
    }
}

const passwordFields = document.getElementById('password-fields');
const avatarUploadLabel = document.querySelector('.avatar-label span:last-child');
const avatarUploadInput = document.getElementById('avatar-upload');

function hidePartnerSpecificElements(passwordFields, changePasswordBtn, submitButton) {
    if (passwordFields) passwordFields.style.display = 'none';
    if (changePasswordBtn) changePasswordBtn.style.display = 'none';
    if (submitButton) submitButton.style.display = 'none';
    //隱藏頭像上傳相關元素
    if (avatarUploadLabel) {
        avatarUploadLabel.style.display = 'none';
    }
    if (avatarUploadInput) {
        avatarUploadInput.disabled = true;
    }
}


document.addEventListener('DOMContentLoaded', () => {
    loadUserAvatar();
    initializePartnerModal();
});

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM fully loaded and parsed');
    
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

    let isLoggedIn = !!localStorage.getItem('token');
    const currentPage = window.location.pathname;
    const isMatchPage = window.location.pathname.includes('match.html');
    const stars = document.querySelectorAll('.star');
    const ratingValue = document.querySelector('.rating-value');
    const weatherSelect = document.getElementById('weatherSelect');


    if (isLoggedIn) {
        await updateUserDisplay();
        if (isMatchPage) {
            initializeMatchPage();
        }
        } else if (currentPage.includes('diary.html') || currentPage.includes('match.html')) {
            // 如果未登錄且嘗試訪問需要登錄的頁面，重定向到首頁
            window.location.href = '/static/index.html';
            }


    
    // 登入按鈕事件
    if (loginBtn) {
        loginBtn.onclick = function(e) {
            e.preventDefault();
            if (isLoggedIn) {
                handleLogout();
            } else {
                showLoginModal();
            }
        };
    }

        // 處理 "START MY MOODs" 按鈕點擊事件
    const startMyMoodsBtns = document.querySelectorAll('.start-my-moods-btn');
    if (startMyMoodsBtns.length > 0) {
        startMyMoodsBtns.forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                if (isLoggedIn) {
                    window.location.href = '/static/diary.html'; // 已登入，跳轉到 diary.html
                } else {
                    showLoginModal(); // 未登入，顯示登入框
                }
            });
        });
    }

    // 處理 "MOODs EXCANGE" 按鈕點擊事件
    const moodsExchangeBtn = document.getElementById('moodsExchangeBtn');
    if (moodsExchangeBtn) {
        moodsExchangeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (isLoggedIn) {
                window.location.href = '/static/match.html'; // 已登入，跳轉到 diary.html
            } else {
                showLoginModal(); // 未登入，顯示登入框
            }
        });
    }

    async function handleLogout() {
        localStorage.clear();
        if (window.matchWebSocket) {
            window.matchWebSocket.close();
        }
        isLoggedIn = false;
        await updateUserDisplay();
        if (userAvatar) {
            userAvatar.style.display = 'none';
        }
        // 如果在需要登錄的頁面上登出，重定向到首頁
        const currentPage = window.location.pathname;
        if (currentPage.includes('diary.html') || currentPage.includes('match.html')) {
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
                    showMessage(failMessage, data.message || 'Login failed, please try again later');
                } else if (data.token) {
                    //加入user_name, email
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
                        }
                        if (tokenPayload.id) {
                            localStorage.setItem('user_id', tokenPayload.id);
                        }

                    updateUserDisplay();
                    showMessage(successLoginMessage, 'Sign in successfully');
                    setTimeout(() => {
                        closeModals();
                        
                         // 如果在 match 頁面,建立 WebSocket 連接
                        if (window.location.pathname.includes('match.html')) {
                            connectWebSocket();
                        }
                    }, 2000);
                } else {
                    showMessage(failMessage, 'Login failed, please try again later');
                }
            })
            .catch(error => {
                showMessage(failMessage, 'An error occurred, please try again later');
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
                showMessage(data.message.includes('重複的 Email') ? failEmailRegisted : failRegisted, data.message);
            } else if (data.ok) {
                showMessage(successSignupMessage, 'Registration successful, please log in to the system');
                setTimeout(() => {
                    modal_signup.style.display = "none";
                    modal_login.style.display = "block";
                }, 2000);
            } else {
                showMessage(failRegisted, 'Registration failed, please try again later');
            }
        })
        .catch(error => {
            showMessage(failRegisted, 'An error occurred, please try again later');
            console.log('Error', error.message);
        });
    }


    // 只在 diary, match 頁面執行的代碼====================================
    const isDiaryPage = window.location.pathname.includes('diary.html');
    if (isDiaryPage || isMatchPage) {
        // 檢查登錄狀態
        if (!isLoggedIn) {
            window.location.href = '/static/index.html';
            return;
        }

        const saveDiaryBtn = document.getElementById('saveDiaryBtn');
        const diaryContent = document.getElementById('diaryContent');
        const selectedDateElement = document.getElementById('selectedDate');
        const recentDiariesContainer = document.getElementById('recentDiaries');
        const deleteDiaryBtn = document.getElementById('deleteDiaryBtn');
        const postToPublicBtn = document.getElementById('postToPublicBtn');
        const downloadBtn = document.getElementById('downloadMyMoods');

        if(downloadBtn) {
            downloadBtn.addEventListener('click', function(e) {
                e.preventDefault();
                const token = localStorage.getItem('token');
                if(!token) {
                    showMessage(document.querySelector('.fail-message'), `Please sign-in first`);
                    return;
                }
                
                const format = prompt('Type one of download formats (json, csv, pdf):').toLowerCase();

                if (!['json', 'csv', 'pdf'].includes(format)) {
                    showMessage(document.querySelector('.fail-message'), `Please type one format`);
                    return;
                }

                fetch (`/download_moods/${format}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                .then (response => {
                    if (!response.ok) {
                        throw new Error('Download Failed');
                    }
                    return response.blob(); // 總是返回 blob，包括 JSON
                })
                .then (blob => {
                    downloadBlob(blob, `my_moods.${format}`);
                })
                .catch(error => {
                    console.error('Download Failed', error);
                    showMessage(document.querySelector('.fail-message'), `Download Failed, Please try again later`);
                });
            });
        }

        function downloadBlob(blob, filename) {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        }

        if (stars.length > 0) {
            stars.forEach(star => {
                star.addEventListener('mouseover', function() {
                    const rating = this.getAttribute('data-rating');
                    highlightStars(rating);
                    ratingValue.textContent = rating;
                });
        
                star.addEventListener('mouseout', function() {
                    highlightStars(currentMoodScore);
                    ratingValue.textContent = currentMoodScore || '';
                });
        
                star.addEventListener('click', function() {
                    currentMoodScore = this.getAttribute('data-rating');
                    highlightStars(currentMoodScore);
                    ratingValue.textContent = currentMoodScore;
                });
            });
        } else {
            console.log('Star rating elements not found');
        }
    
        if (weatherSelect) {
            weatherSelect.addEventListener('change', function() {
                currentWeather = this.value;
                if (this.selectedIndex === 0) {
                    currentWeather = null;
                }
            });
        } else {
            console.log('Weather select element not found');
        }

        function highlightStars(rating) {
            const stars = document.querySelectorAll('.star');
            stars.forEach(star => {
                star.classList.toggle('active', star.getAttribute('data-rating') <= rating);
            });
        }


    let currentEntryId = null;
        
    // 加載今天的日記
    loadDiaryEntry(new Date());

    saveDiaryBtn.addEventListener('click', saveDiaryEntry);

    if (postToPublicBtn) {
        postToPublicBtn.addEventListener('click', postToPublic); // match頁面不裝ToPublicBtn
    }


    function saveDiaryEntry() {
        const now = Date.now();
        const timeElapsed = now - lastSaveTime;

        if (timeElapsed < SAVE_COOLDOWN) {
            const remainingTime = Math.ceil((SAVE_COOLDOWN - timeElapsed) / 1000);
            console.log('Cooldown active, remaining time:', remainingTime);
            showMessage(document.querySelector('.fail-message'), `Please wait ${remainingTime} seconds before saving again.`);
            return;
        }

        console.log('Proceeding with save operation');

        // 如果通過冷卻檢查，禁用按鈕
        saveDiaryBtn.disabled = true;
        if (postToPublicBtn) {
            postToPublicBtn.disabled = true;
        }

        const content = diaryContent.value.trim();
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage(document.querySelector('.fail-message'), 'Please sign in first');
            return;
        }

        if (!content) {
            showMessage(document.querySelector('.fail-message'), 'EMPTY MOODs');
            saveDiaryBtn.disabled = false;  // 重新啟用按鈕
            if (postToPublicBtn) postToPublicBtn.disabled = false;
            return;
        }
        
        // const today = new Date().toLocaleDateString('en-CA');  // YYYY-MM-DD 格式
        const selectedDate = document.getElementById('selectedDate').textContent;
        if (!selectedDate) {
            showMessage(document.querySelector('.fail-message'), 'No date selected');
            saveDiaryBtn.disabled = false;  // 重新啟用按鈕
            if (postToPublicBtn) postToPublicBtn.disabled = false;
            return;
        }
        
        // 準備要發送的數據

        const moodData = {
            mood_score: currentMoodScore !== undefined ? currentMoodScore : null,
            date: selectedDate,
            weather: currentWeather || null,  // 如果未設置，使用 null
            note: content
        };
        console.log('Saving mood data:', JSON.stringify(moodData, null, 2));

        const diaryData = {
            title: "Diary Entry",
            content: content,
            date: selectedDate,
            is_public: false
        };

        // 保存心情數據
        
        fetch('/save_mood_entry', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(moodData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to save mood data');
            }
            return response.json();
        })
        .then(moodResponse => {
            console.log('Mood data saved successfully:', moodResponse);        

            const url = currentEntryId ? `/update_diary_entry/${currentEntryId}` : '/create_diary_entry';
            const method = currentEntryId ? 'PUT' : 'POST';
    
        // saveDiaryBtn.disabled = true;
        // lastSaveTime = now;

            return fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(diaryData)
            });
        })
        .then(response => response.json())
        .then(data => {
            if (data.id) {
                showMessage(document.querySelector('.success-message'), 'Diary saved successfully!');
                currentEntryId = data.id;
                saveDiaryBtn.textContent = 'UPDATE';

                updateCalendar(new Date().getFullYear(), new Date().getMonth() + 1);
                loadRecentDiaries();

            } else {
                showMessage(document.querySelector('.fail-message'), 'Failed to save. Please try again later.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showMessage(document.querySelector('.fail-message'), 'An error occurred. Please try again later.');
        })
        .finally(() => {
            // 5秒後重新啟用保存按鈕
            setTimeout(() => {
                saveDiaryBtn.disabled = false;
                if (postToPublicBtn) postToPublicBtn.disabled = false;
            }, SAVE_COOLDOWN);
        });
    }

    async function postToPublic() {
        const now = Date.now();
        const timeElapsed = now - lastSaveTime;

        if (timeElapsed < SAVE_COOLDOWN) {
            const remainingTime = Math.ceil((SAVE_COOLDOWN - timeElapsed) / 1000);
            console.log('Cooldown active, remaining time:', remainingTime);
            showMessage(document.querySelector('.fail-message'), `Please wait ${remainingTime} seconds before saving again.`);
            return;
        }
        postToPublicBtn.disabled = true;

        const text = diaryContent.value.trim();
        const imageUrl = ''; // 私人日記不上傳圖片，但我們仍然傳送一個空字串

        const token = localStorage.getItem('token');
        if (!token) {
            showMessage(document.querySelector('.fail-message'), 'Please sign in first');
            return;
        }

        if (!text) {
            showMessage(document.querySelector('.fail-message'), 'EMPTY MOODs');
            saveDiaryBtn.disabled = false;  // 重新啟用按鈕
            postToPublicBtn.disabled = false;
            return;
        }

        const selectedDate = document.getElementById('selectedDate').textContent;
        if (!selectedDate) {
            showMessage(document.querySelector('.fail-message'), 'No date selected');
            saveDiaryBtn.disabled = false;  // 重新啟用按鈕
            postToPublicBtn.disabled = false;
            return;
        }

        // 準備要發送的數據

        const diaryData = {
            title: "Diary Entry",
            content: text,
            date: selectedDate,
            is_public: false
        };

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                showMessage(document.querySelector('.fail-message'),'Please Signin First');
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
    
            showMessage(document.querySelector('.success-message'),'Post to public sucessfully');
            lastSubmitTime = now;
        } catch (error) {
            console.error('發佈錯誤:', error);
            showMessage(document.querySelector('.fail-message'), 'To-Public Failed, Please try again later');
        } finally {
            setTimeout(() => {
                if (postToPublicBtn) postToPublicBtn.disabled = false;
                saveDiaryBtn.disabled = false;
            }, SAVE_COOLDOWN);
        }
    }
    
    // 在頁面加載時初始化日曆
    if (isDiaryPage) {
        console.log('Attempting to generate calendar');
        const currentDate = new Date();
        currentYear = currentDate.getFullYear();
        currentMonth = currentDate.getMonth() + 1; // 注意：getMonth() 返回 0-11

        const prevMonthBtn = document.getElementById('prevMonthBtn');
        const nextMonthBtn = document.getElementById('nextMonthBtn');
        const currentMonthYearElem = document.getElementById('currentMonthYear');

        function updateMonthYearDisplay(year, month) {
            currentMonthYearElem.textContent = `${year}Y ${month}M`;
        }

        generateCalendar(currentYear, currentMonth);
        updateCalendar(currentYear, currentMonth);
        loadDiaryEntry(new Date());
        loadRecentDiaries();
        updateMonthYearDisplay(currentYear, currentMonth);
    
        prevMonthBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 1) {
                currentMonth = 12;
                currentYear--;
            }
            generateCalendar(currentYear, currentMonth);
            updateCalendar(currentYear, currentMonth);
            updateMonthYearDisplay(currentYear, currentMonth);
        });

        nextMonthBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 12) {
                currentMonth = 1;
                currentYear++;
            }
            generateCalendar(currentYear, currentMonth);
            updateCalendar(currentYear, currentMonth);
            updateMonthYearDisplay(currentYear, currentMonth);
        });
    }   // 在頁面加載時初始化日曆尾部=============


    currentEntryId = null;

    async function loadDiaryEntry(date, entryId = null) {
        const token = localStorage.getItem('token');
        if (!token) {
            showMessage(document.querySelector('.fail-message'), 'PLEASE SIGN IN');
            return;
        }
    
        let param = entryId ? entryId : getFormattedDate(date);
        let url = `/get_diary_entry/${param}`;
    
        fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    return { notFound: true, date: param };
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.notFound || (Array.isArray(data) && data.length === 0)) {
                handleEmptyDiary(param);
                resetMoodUI();
                // resetDiaryContent();  // 新增：重置日記內容
            } else {
                const entry = Array.isArray(data) ? data[0] : data;
                handleDiaryEntry(entry, true);  // 傳入 true 表示直接進入編輯模式
                if (entry.mood_data) {
                    currentMoodScore = entry.mood_data.mood_score || 0;
                    currentWeather = entry.mood_data.weather || '';
                    updateMoodUI();
                } else {
                    resetMoodUI();
                }
            }
            updateUIElements();
        })
        .catch(error => {
            console.error('Error loading diary entry:', error);
            showMessage(document.querySelector('.fail-message'), 'Failed to load diary content');
            handleEmptyDiary(param);
            resetMoodUI();
            updateUIElements();
        });
    }
    
    
    function handleDiaryEntry(entry, editMode = false) {
        diaryContent.value = entry.content;            
        if (selectedDateElement) {
            selectedDateElement.textContent = entry.date;
        }
        currentEntryId = entry.id;
        if (saveDiaryBtn) {
            saveDiaryBtn.textContent = 'UPDATE';
        }
        isEditing = editMode;
        diaryContent.readOnly = !editMode;
    }
        

    function handleEmptyDiary(date) {
        diaryContent.value = '';
        if (selectedDateElement) {
            selectedDateElement.textContent = date;
            // selectedDateElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        currentEntryId = null;
        if (saveDiaryBtn) {
            saveDiaryBtn.textContent = 'SAVE';
        }
        isEditing = true; 
    }

    async function updateUIElements() {
        console.log('Updating UI elements...');
        console.log('Diary content:', diaryContent.value);
        console.log('Selected date:', selectedDateElement ? selectedDateElement.textContent : 'N/A');
        console.log('Current entry ID:', currentEntryId);
        console.log('Save button text:', saveDiaryBtn ? saveDiaryBtn.textContent : 'N/A');
        console.log('Delete button visibility:', deleteDiaryBtn ? deleteDiaryBtn.style.display : 'N/A');
    }

    function loadMoodData(date) {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('No token found, mood data not loaded');
            return;
        }
        console.log('Fetching mood data for date:', date);  // 新增

        fetch(`/get_diary_entry/${date}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            console.log('Response status:', response.status);  // 新增

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('Mood data not found for date:', date);  // 新增

                    return null;  // 沒有找到心情數據
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Received mood data:', data);  // 新增

            if (data && data.length > 0 && data[0].mood_data) {
                currentMoodScore = data[0].mood_data.mood_score || 0;
                currentWeather = data[0].mood_data.weather || '';
    
                updateMoodUI();
            } else {
                console.log('Resetting mood UI due to invalid data');  // 新增

                resetMoodUI();
            }
        })
        .catch(error => {
            console.error('Error loading mood data:', error);
            resetMoodUI();
        });
    }
    
    // 更新心情 UI 的函數
    function updateMoodUI() {
        if (stars && stars.length > 0) {
            highlightStars(currentMoodScore);
        }
        if (ratingValue) {
            ratingValue.textContent = currentMoodScore !== undefined ? currentMoodScore : '';
        }
        if (weatherSelect) {
            weatherSelect.value = currentWeather || '';
            if (!currentWeather) {
                weatherSelect.selectedIndex = 0;
            }
        }
    }
    
    // 重置心情 UI 的函數
    function resetMoodUI() {
        currentMoodScore = undefined;
        currentWeather = null;
        if (stars && stars.length > 0) {
            highlightStars(0);
        }
        if (ratingValue) {
            ratingValue.textContent = '';
        }
        if (weatherSelect) {
            weatherSelect.selectedIndex = 0; // 重置為預設選項
        }
    }
    
    function highlightStars(score) {
        const stars = document.querySelectorAll('.star');
        stars.forEach((star, index) => {
            if (index < score) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    }
   

    function getFormattedDate(date) {
        // 確保使用的是台北時間
        const taipeiDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
        
        // 獲取年、月、日
        const year = taipeiDate.getFullYear();
        const month = String(taipeiDate.getMonth() + 1).padStart(2, '0');
        const day = String(taipeiDate.getDate()).padStart(2, '0');
        
        // 格式化日期字符串
        const formattedDate = `${year}-${month}-${day}`;
        
        console.log('Selected date:', date);
        console.log('Formatted date for API:', formattedDate);
        
        return formattedDate;
        }
    
        
    function generateCalendar(year, month) {
        if (year === undefined || month === undefined) {
            console.error('Invalid year or month:', year, month);
            return;
        }
        const calendarWall = document.querySelector('.calendar-wall');
        if (!calendarWall) {
            console.error('Calendar wall element not found');
            return;
        }
        calendarWall.innerHTML = '';
    
        const date = new Date(year, month - 1, 1); // 月份需要減 1，因為 Date 對象的月份是 0-11
        const lastDay = new Date(year, month, 0).getDate();
        const firstDayIndex = date.getDay();
    
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thr', 'Fri', 'Sat'];

        weekdays.forEach(day => {
            const dayElement = document.createElement('div');
            dayElement.classList.add('calendar-day', 'weekday');
            dayElement.textContent = day;
            calendarWall.appendChild(dayElement);
        });
        // 添加空白天數
        for (let i = 0; i < firstDayIndex; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.classList.add('calendar-day', 'empty');
            calendarWall.appendChild(emptyDay);
        }
    
        // 添加日期
        for (let i = 1; i <= lastDay; i++) {
            const dayElement = document.createElement('div');
            dayElement.classList.add('calendar-day');
            
            const dayContent = document.createElement('div');
            dayContent.classList.add('calendar-day-content');
            dayContent.textContent = i;
            
            dayElement.appendChild(dayContent);
            calendarWall.appendChild(dayElement);
    
            dayElement.addEventListener('click', () => {
                const clickedDate = new Date(year, month - 1, i);
                loadDiaryEntry(clickedDate);
            });
        }
    }
    
    async function updateCalendar(year, month) {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('未找到 token，日曆未更新');
            return;
        }
    
        fetch('/get_diary_entries', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(entries => {
            const calendarDays = document.querySelectorAll('.calendar-day');
            calendarDays.forEach(day => {
                const dayNumber = parseInt(day.querySelector('.calendar-day-content')?.textContent);
                if (!isNaN(dayNumber)) {
                    const hasEntry = entries.some(entry => {
                        const entryDate = new Date(entry.date);
                        return entryDate.getFullYear() === year &&
                                entryDate.getMonth() === month - 1 &&
                                entryDate.getDate() === dayNumber;
                    });
                    if (hasEntry) {
                        day.classList.add('has-entry');
                    } else {
                        day.classList.remove('has-entry');
                    }
                }
            });
        })
        .catch(error => {
            console.error('獲取日記條目時出錯：', error);
        });
    }

    async function loadRecentDiaries() {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('No token found, recent diaries not loaded');
            return;
        }

        fetch('/get_diary_entries', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(entries => {
            console.log('Received entries:', entries);
            recentDiariesContainer.innerHTML = ''; // 清空現有內容
            entries.slice(0, 5).forEach(entry => { // 只顯示最近5篇
                const entryElement = document.createElement('div');
                entryElement.classList.add('recent-diary-entry');
                entryElement.innerHTML = `
                <div class="entry-content">
                    <h3>${entry.date}</h3>
                    <p>${entry.content.substring(0, 100)}${entry.content.length > 100 ? '...' : ''}</p>
                </div>
                <button class="delete-entry-btn" data-id="${entry.id}">DELETE</button>
            `;
            entryElement.addEventListener('click', function(e) {
                if (!e.target.classList.contains('delete-entry-btn')) {
                    loadDiaryEntry(new Date(entry.date), entry.id);
                }
            });
            recentDiariesContainer.appendChild(entryElement);
        });
        // 為每個刪除按鈕添加事件監聽器
        document.querySelectorAll('.delete-entry-btn').forEach(button => {
            button.addEventListener('click', function() {
                const entryId = this.getAttribute('data-id');
                deleteDiaryEntry(entryId);
                });
            });
        })
        .catch(error => {
            console.error('Error fetching recent diary entries:', error);
        });
    }

    
    async function deleteDiaryEntry(entryId) {

        const now = Date.now();
        const timeElapsed = now - lastDeleteTime;

        if (timeElapsed < DELETE_COOLDOWN) {
            const remainingTime = Math.ceil((DELETE_COOLDOWN - timeElapsed) / 1000);
            showMessage(document.querySelector('.fail-message'), `Please wait ${remainingTime} seconds before deleting again.`);
            return;
        }

        if (confirm('Are you sure you want to delete this diary entry? This action cannot be undone')) {
            const token = localStorage.getItem('token');
            if (!token) {
                showMessage(document.querySelector('.fail-message'), 'DELETED FAIL');
                return;
            }

            // 禁用所有刪除按鈕
            const deleteButtons = document.querySelectorAll('.delete-entry-btn');
            deleteButtons.forEach(button => button.disabled = true);

            lastDeleteTime = now; // 更新最後刪除時間

            try {
                console.log('Sending delete request for entry ID:', entryId);

                const response = await fetch(`/delete_diary_entry/${entryId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
    
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
    
                const data = await response.json();
                if (data.message) {
                    showMessage(document.querySelector('.success-message'), 'Diary entry successfully deleted');
                    
                    await loadRecentDiaries(); // 重新載入最近的日記列表
                    await updateCalendar(new Date().getFullYear(), new Date().getMonth() + 1); // 更新日曆
                    
                    // 如果刪除的是當前顯示的日記，清空內容並更新 UI

                    diaryContent.value = '';
                    saveDiaryBtn.textContent = 'SAVE';
                    currentEntryId = null; // 重要：重置 currentEntryId

                    updateUIElements();
                    }
            } catch (error) {
                console.error('Error in delete operation:', error);
                showMessage(document.querySelector('.fail-message'), 'AN ERROR OCCURRED, PLEASE TRY AGAIN LATER');
            } finally {
                console.log('Re-enabling delete buttons after cooldown');
                // 5秒後重新啟用所有刪除按鈕
                setTimeout(() => {
                    deleteButtons.forEach(button => button.disabled = false);
                    console.log('Delete buttons re-enabled');
                }, DELETE_COOLDOWN);
            }
        } else {
            console.log('Delete cancelled by user');
        }
    }

    loadDiaryEntry(new Date());
    loadRecentDiaries(); // 頁面加載時載入最近的日記


    } // 只在 diary.html 頁面執行的代碼尾部=========================

    function showMessage(element, message, delay = 0) {
        console.log('Showing message:', message); // 添加日誌
        setTimeout(() => {
            if (element) {
                const translations = {
                    '登入失敗，帳號或密碼錯誤或其他原因': 'You have entered an invalid username or password',
                    '註冊失敗，重複的 Email 或其他原因': 'Registration failed, please check email and password'
                };
                element.textContent = translations[message] || message;
                element.style.display = 'block';
                console.log('Message displayed:', element.textContent); // 添加日誌
                setTimeout(() => {
                    element.style.display = 'none';
                    console.log('Message hidden'); // 添加日誌
                }, 3000);
            } else {
                console.error('Message element not found:', message);
            }
        }, delay);
    }

    // 更新用戶自己的模態框內容
    function updateUserModalContent() {
        const modalTitle = document.querySelector('#user-profile-modal .log-in');
        const avatarPreview = document.getElementById('avatar-preview');
        const selfIntroElement = document.getElementById('self-intro');
        const passwordFields = document.getElementById('password-fields');
        const changePasswordBtn = document.getElementById('change-password-btn');
        const submitButton = document.querySelector('#user-profile-modal button[type="submit"]');

        if (modalTitle) modalTitle.textContent = "MOOD account";
        
        updateAvatarDisplay(avatarPreview);
        updateSelfIntro(selfIntroElement);
        showUserSpecificElements(passwordFields, changePasswordBtn, submitButton);
    }


    function updateAvatarDisplay(avatarPreview) {
        if (avatarPreview) {
            const avatarUrl = localStorage.getItem('avatarUrl');
            if (avatarUrl) {
                avatarPreview.style.backgroundImage = `url('${avatarUrl}')`;
                avatarPreview.textContent = '';
            } else {
                avatarPreview.style.backgroundImage = '';
                avatarPreview.textContent = localStorage.getItem('user_name').charAt(0).toUpperCase();
            }
        }
    }

    function updateSelfIntro(selfIntroElement) {
        if (selfIntroElement) {
            selfIntroElement.value = localStorage.getItem('selfIntro') || '';
            selfIntroElement.readOnly = false;
        }
    }

    function showUserSpecificElements(passwordFields, changePasswordBtn, submitButton) {
        if (passwordFields) passwordFields.style.display = 'none';
        if (changePasswordBtn) changePasswordBtn.style.display = 'block';
        if (submitButton) submitButton.style.display = 'block';
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

    const userProfileModal = document.getElementById('user-profile-modal');

    if (userAvatar) {
        userAvatar.addEventListener('click', function() {
            if (userProfileModal) {
                isViewingPartnerProfile = false;
                openUserProfileModal();
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
    // 新的開啟用戶個人資料模態框函數
    function openUserProfileModal() {
        if (userProfileModal) {
            userProfileModal.style.display = 'block';
            overlay.style.display = 'block';
            clearPasswordFields();
            resetPasswordChangeUI();
            updateUserModalContent();
        }
    }

    // 頭像預覽
    const avatarUpload = document.getElementById('avatar-upload');
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
    
    const changePasswordBtn = document.getElementById('change-password-btn');
    // 顯示/隱藏密碼欄位
    changePasswordBtn.addEventListener('click', function() {
        passwordFields.style.display = passwordFields.style.display === 'none' ? 'block' : 'none';
    });

    if (selfIntroElement) {
        const savedSelfIntro = localStorage.getItem('selfIntro');
        if (savedSelfIntro) {
            selfIntroElement.value = savedSelfIntro;
        }

        selfIntroElement.addEventListener('input', function() {
            localStorage.setItem('selfIntro', this.value);
        });
    }

    const profileForm = document.getElementById('profile-form');

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
        

        if (!currentPassword && !newPassword && !confirmPassword) {
            formData.delete('current-password');
            formData.delete('new-password');
            formData.delete('confirm-password');
        } else if (newPassword !== confirmPassword) {
            showMessage(document.querySelector('.fail-self-info'), 'New passwords do not match');
            return;
        }
        

        let avatarUrl = '';
        if (avatarFile) {
            try {
                // 獲取預簽名 URL
                const presignedUrlResponse = await fetch('/get_presigned_url', {
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
                console.error('Error uploading avatar:', error);
                showMessage(document.querySelector('.fail-self-info'), 'Upload avatar failed');
                submitButton.disabled = false;
                return;
            }
        }

        try {
            const token = localStorage.getItem('token');

            if (!token) {
                showMessage(document.querySelector('.fail-self-info'), 'Please signin first');
                return;
            }

            const response = await fetch('/update_profile', {
                method: 'POST',
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                    avatar_url: avatarUrl,
                    self_intro: selfIntro  // 添加 self_intro 到發送的數據中
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                console.log('Update successful, received result:', result);

                localStorage.setItem('selfIntro', selfIntro);

                showMessage(document.querySelector('.success-self-info'), 'Update profile successfully');
                if (result.avatar_url) {
                    console.log('Attempting to update avatar with URL:', result.avatar_url);
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
                localStorage.setItem('selfIntro', selfIntro);
            } else {
                console.error('Update failed:', result.message);
                showMessage(document.querySelector('.fail-self-info'), result.message || 'Update profile failed');
            }

        } catch (error) {
            console.error('Error updating profile:', error);
            showMessage(document.querySelector('.fail-self-info'), 'Update profile failed');
        } finally {
            submitButton.disabled = false;
        }
    });
}

}); //DOM尾部==========================

// 添加重試邏輯的輔助函數
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// jQuery 代碼
$(document).ready(function () {
    const cardWrap = $('.card-wrap');
    function onMouseEnter() {
        const card = $(this).find('.card');
        const borderWrap = $(this).find('.border-wrap');
        const cardBounds = this.getBoundingClientRect();
        
        $(document).on('mousemove', function(e) {
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const leftX = mouseX - cardBounds.left;
            const topY = mouseY - cardBounds.top;
            const center = {
                x: leftX - cardBounds.width / 2,
                y: topY - cardBounds.height / 2,
            };
            const distance = Math.sqrt(center.x ** 2 + center.y ** 2);
            
            card.css('transform', `
                scale3d(1.0, 1.0, 1.0)
                perspective(800px)
                rotate3d(
                ${-center.y / 100},
                ${center.x / 100},
                0,
                ${Math.log(distance) * 0.8}deg
                )
            `);
            
            borderWrap.css('background-image', `
                radial-gradient(
                circle at
                ${center.x * 2 + cardBounds.width / 2 - 30}px
                ${center.y * 2 + cardBounds.height / 2 - 30}px,
                #ffffff3e,
                #0000000f
                )
            `);
        });
    }
    
    function onMouseLeave() {
        const card = $(this).find('.card');
        const borderWrap = $(this).find('.border-wrap');
        $(document).off('mousemove');
        card.css('transform', '');
        borderWrap.css('background-image', '');
    }
    
    cardWrap.on('mouseenter', onMouseEnter);
    cardWrap.on('mouseleave', onMouseLeave);
});