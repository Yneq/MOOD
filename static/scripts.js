// 全局變量
let currentYear, currentMonth;
let ws; // WebSocket 連線
let currentPartnerId = null;

const SAVE_COOLDOWN = 5000; 
let lastSaveTime = 0;
const DELETE_COOLDOWN = 5000;
let lastDeleteTime = 0;


document.addEventListener('DOMContentLoaded', (event) => {
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

    if (isLoggedIn) {
        updateLoginButtonText();
        if (isMatchPage) {
            initializeMatchPage();
        }
        } else if (currentPage.includes('diary.html') || currentPage.includes('match.html')) {
            // 如果未登錄且嘗試訪問需要登錄的頁面，重定向到首頁
            window.location.href = '/static/index.html';
            }

    function updateLoginButtonText() {
        if (loginBtn) {
            loginBtn.textContent = isLoggedIn ? 'Sign out' : 'Sign in';
        } else {
            console.error('Login button not found');
        }
    }

    updateLoginButtonText();

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
    const startMyMoodsBtn = document.getElementById('startMyMoodsBtn');
    if (startMyMoodsBtn) {
        startMyMoodsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (isLoggedIn) {
                window.location.href = '/static/diary.html'; // 已登入，跳轉到 diary.html
            } else {
                showLoginModal(); // 未登入，顯示登入框
            }
        });
    }

    // 處理 "START PUBLIC MOODs" 按鈕點擊事件
    const startPublicMoodsBtn = document.getElementById('startPublicMoodsBtn');
    if (startPublicMoodsBtn) {
        startPublicMoodsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (isLoggedIn) {
                window.location.href = '/static/board.html'; // 已登入，跳轉到 board.html
            } else {
                showLoginModal(); // 未登入，顯示登入框
            }
        });
    }

    function handleLogout() {
        localStorage.clear();
        if (window.matchWebSocket) {
            window.matchWebSocket.close();
        }
        updateLoginButtonText();
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
                        console.log('Stored user info:', {
                            token: data.token,
                            user_name: localStorage.getItem('user_name'),
                            email: localStorage.getItem('email'),
                            user_id: localStorage.getItem('user_id')
                        });

                    showMessage(successLoginMessage, 'Sign in successfully');
                    setTimeout(() => {
                        closeModals();
                        isLoggedIn = true;
                        updateLoginButtonText();
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
        const editDiaryBtn = document.getElementById('editDiaryBtn');


        let currentEntryId = null;

        // 新增：檢查今天的日記
        function checkTodayDiary() {
            const token = localStorage.getItem('token');
            const today = new Date().toISOString().split('T')[0];

            fetch(`/get_diary_entry/${today}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.id) {
                    // 今天已經有日記
                    diaryContent.value = data.content;
                    saveDiaryBtn.textContent = 'UPDATE';
                    currentEntryId = data.id;

                    // 更新 selectedDiaryContent（如果存在）
                    const selectedDiaryContent = document.getElementById('selectedDiaryContent');
                    if (selectedDiaryContent) {
                        selectedDiaryContent.textContent = data.content;
                    }

                    // 更新日期顯示（如果有的話）
                    const selectedDateElement = document.getElementById('selectedDate');
                    if (selectedDateElement) {
                        selectedDateElement.textContent = today;
                    }
                } else {
                    // 今天還沒有日記
                    diaryContent.value = '';
                    saveDiaryBtn.textContent = 'SAVE';
                    currentEntryId = null;
                    
                    // 清空 selectedDiaryContent（如果存在）
                    const selectedDiaryContent = document.getElementById('selectedDiaryContent');
                    if (selectedDiaryContent) {
                        selectedDiaryContent.textContent = '';
                    }
                }
            })
            .catch(error => {
                console.error('Error checking today\'s diary:', error);
            });
        }

        // 加載今天的日記
        loadDiaryEntry(new Date());

        saveDiaryBtn.addEventListener('click', saveDiaryEntry);
        function saveDiaryEntry() {
            const now = Date.now();
            const timeElapsed = now - lastSaveTime;

            console.log('Current time:', now);
            console.log('Last save time:', lastSaveTime);
            console.log('Time elapsed:', timeElapsed);

            if (timeElapsed < SAVE_COOLDOWN) {
                const remainingTime = Math.ceil((SAVE_COOLDOWN - timeElapsed) / 1000);
                console.log('Cooldown active, remaining time:', remainingTime);
                showMessage(document.querySelector('.fail-message'), `Please wait ${remainingTime} seconds before saving again.`);
                return;
            }

            console.log('Proceeding with save operation');

            // 如果通過冷卻檢查，禁用按鈕
            saveDiaryBtn.disabled = true;

            const content = diaryContent.value.trim();
            const token = localStorage.getItem('token');
            if (!token) {
                showMessage(document.querySelector('.fail-message'), 'Please sign in first');
                return;
            }

            if (!content) {
                showMessage(document.querySelector('.fail-message'), 'EMPTY MOODs');
                saveDiaryBtn.disabled = false;  // 重新啟用按鈕
                return;
            }
            
            // const today = new Date().toLocaleDateString('en-CA');  // YYYY-MM-DD 格式
            const selectedDate = document.getElementById('selectedDate').textContent;
            if (!selectedDate) {
                showMessage(document.querySelector('.fail-message'), 'No date selected');
                saveDiaryBtn.disabled = false;  // 重新啟用按鈕
                return;
            }
            

            // 準備要發送的數據
            const diaryData = {
                title: "Diary Entry",
                content: content,
                date: selectedDate,
                is_public: false
            };

            const url = currentEntryId ? `/update_diary_entry/${currentEntryId}` : '/create_diary_entry';
            const method = currentEntryId ? 'PUT' : 'POST';
        
            saveDiaryBtn.disabled = true;
             // 在更新 lastSaveTime 前後添加調試信息
            console.log('Updating lastSaveTime to:', now);
            lastSaveTime = now;
            console.log('Last save time updated:', lastSaveTime);

            fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(diaryData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.id) {
                    showMessage(document.querySelector('.success-message'), 'Today\'s diary saved successfully!');
                    currentEntryId = data.id;
                    saveDiaryBtn.textContent = 'UPDATE';

                    // 更新顯示的日記內容
                    diaryContent.value = content;

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
                }, SAVE_COOLDOWN);
            });
        }
        
        
        
         // 在頁面加載時檢查今天的日記
        checkTodayDiary();
        
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

            // if (saveDiaryBtn) {
            //     saveDiaryBtn.addEventListener('click', saveDiaryEntry);
            // }
        }   // 在頁面加載時初始化日曆尾部=============


        // let currentEntryId = null;
        let isEditing = false;

        function loadDiaryEntry(date, entryId = null) {
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
                } else if (Array.isArray(data)) {
                    handleDiaryEntry(data[0], true);  // 傳入 true 表示直接進入編輯模式
                } else {
                    handleDiaryEntry(data, true);  // 傳入 true 表示直接進入編輯模式
                }
            })
            .catch(error => {
                console.error('Error loading diary entry:', error);
                showMessage(document.querySelector('.fail-message'), 'Failed to load diary content');
                handleEmptyDiary(param);
            });
        }
        
        
        function handleDiaryEntry(entry, editMode = false) {
            // const today = new Date().toISOString().split('T')[0];
            // const isToday = entry.date === today;

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
            diaryContent.readOnly = false;

        }

        
        function toggleEdit() {
            console.log('Toggle Edit called. Current state:', isEditing);

            if (!isEditing) {
                console.log('Entering edit mode');
                // Enter edit mode
                editDiaryBtn.textContent = 'SAVE';
                selectedDiaryContent.contentEditable = true;
                selectedDiaryContent.focus();
                isEditing = true;
            } else {
                // if (!checkCooldown('save')) {
                //     console.log('Save cooldown not passed');
                //     showMessage(document.querySelector('.fail-message'), 'Please wait before saving again.');
                //     return;
                // }
                console.log('Attempting to save');
                // Save edit
                const content = selectedDiaryContent.textContent.trim();
                const date = selectedDateElement.textContent;
                
                console.log('Content:', content);
                console.log('Date:', date);
                console.log('Current Entry ID:', currentEntryId);

                if (content) {
                    let canProceed = checkCooldown('save');
                    console.log('Can proceed with save:', canProceed);

                    if (currentEntryId) {
                        console.log('Updating existing entry');
                        updateDiaryEntry(currentEntryId, content, date);
                    } else {
                        console.log('Creating new entry');
                        createNewDiaryEntry(content, date);
                    }
                    editDiaryBtn.textContent = 'EDIT';
                    selectedDiaryContent.contentEditable = false;
                    isEditing = false;
                } else {
                    console.log('Empty content, not saving');
                    showMessage(document.querySelector('.fail-message'), 'EMPTY MOOD');
                    // Keep the content area empty and editable if the user didn't input anything
                    selectedDiaryContent.textContent = '';
                    editDiaryBtn.textContent = 'SAVE';
                    selectedDiaryContent.focus();
                }
            }
            console.log('Edit state after toggle:', isEditing);

        }
        
        // editDiaryBtn.addEventListener('click', toggleEdit);

        function updateDiaryEntry(entryId, content, date) {
            console.log('Updating diary entry:', entryId, content, date);
        
            const token = localStorage.getItem('token');
            fetch(`/update_diary_entry/${entryId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: "更新的日記",
                    content: content,
                    date: date,
                    is_public: false,
                    image_url: null
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.id) {
                    console.log('Diary updated successfully');
                    showMessage(document.querySelector('.success-message'), 'UPDATED SUCCESSFULLY');
                    updateCalendar(new Date(date).getFullYear(), new Date(date).getMonth() + 1);
                    loadRecentDiaries();
                    // 重置冷卻時間
                    lastActionTime['save'] = 0;
                } else {
                    console.error('Failed to update diary:', data);
                    showMessage(document.querySelector('.fail-message'), 'UPDATED FAIL, PLEASE TRY AGAIN LATER');
                }
            })
            .catch(error => {
                console.error('Error updating diary:', error);
                showMessage(document.querySelector('.fail-message'), 'AN ERROR OCCUR, PLEASE TRY AGAIN LATER');
            });
        }
        
        function createNewDiaryEntry(content, date) {
            console.log('Creating new diary entry:', content, date);

            const token = localStorage.getItem('token');

            fetch('/create_diary_entry', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: "新日記",
                    content: content,
                    date: date,
                    is_public: false
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.id) {
                    console.log('New diary created successfully with ID:', data.id);
                    showMessage(document.querySelector('.success-message'), 'RECOREDED MOOD SUCCESSFULLY');
                    currentEntryId = data.id;
                    updateCalendar(new Date(date).getFullYear(), new Date(date).getMonth() + 1);
                    loadRecentDiaries();
                    deleteDiaryBtn.style.display = 'inline-block'; // 顯示刪除按鈕
                } else {
                    console.error('Failed to create new diary:', data);
                    showMessage(document.querySelector('.fail-message'), 'CREATED FAIL, PLEASE TRY AGAIN LATER');
                }
            })
            .catch(error => {
                console.error('Error creating new diary:', error);
                showMessage(document.querySelector('.fail-message'), 'AN ERROR OCCUR, PLEASE TRY AGAIN LATER');
            });
        }
        

        if (editDiaryBtn) {
            editDiaryBtn.addEventListener('click', function() {
                if (!isEditing) {
                    // 進入編輯模式
                    this.textContent = 'SAVE';
                    selectedDiaryContent.contentEditable = true;
                    if (selectedDiaryContent.textContent === 'RECORD YOUR MOOD') {
                        selectedDiaryContent.textContent = ''; // 清空預設文字
                    }
                    selectedDiaryContent.focus();
                    isEditing = true;
                } else {
                    // 儲存編輯
                    this.textContent = 'EDIT';
                    selectedDiaryContent.contentEditable = false;
                    isEditing = false;
                    
                    const content = selectedDiaryContent.textContent.trim();
                    const date = selectedDateElement.textContent;
        
                    if (content) {
                        if (currentEntryId) {
                            updateDiaryEntry(currentEntryId, content, date);
                        } else {
                            createNewDiaryEntry(content, date);
                        }
                    } else {
                        showMessage(document.querySelector('.fail-message'), 'EMPTY MOOD');
                        selectedDiaryContent.textContent = 'RECORD YOUR MOOD';
                    }
                }
            });
        }

        if (deleteDiaryBtn) {
            deleteDiaryBtn.addEventListener('click', function() {
                if (confirm('Are you sure you want to delete this diary entry? This action cannot be undone.')) {
                    const token = localStorage.getItem('token');
                    if (!token || !currentEntryId) {
                        showMessage(document.querySelector('.fail-message'), 'DELETED FAIL, PLEASE TRY AGAIN LATER');
                        return;
                    }
    
                    fetch(`/delete_diary_entry/${currentEntryId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.message) {
                            showMessage(document.querySelector('.success-message'), 'Diary entry successfully deleted');
                            selectedDiaryContent.innerHTML = 'RECORD YOUR MOOD';
                            document.getElementById('editDeleteButtons').style.display = 'none';
                            currentEntryId = null;
                            updateCalendar(new Date(document.getElementById('selectedDate').textContent).getFullYear(), 
                                           new Date(document.getElementById('selectedDate').textContent).getMonth() + 1);
                            loadRecentDiaries();
                        } else {
                            showMessage(document.querySelector('.fail-message'), 'DELETED FAIL, PLEASE TRY AGAIN LATER');
                        }
                    })
                    .catch(error => {
                        console.error('錯誤:', error);
                        showMessage(document.querySelector('.fail-message'), 'AN ERROR OCCUR, PLEASE TRY AGAIN LATER');
                    });
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
            console.log('Generating calendar for:', year, month);
            if (year === undefined || month === undefined) {
                console.error('Invalid year or month:', year, month);
                return;
            }
            const calendarWall = document.querySelector('.calendar-wall');
            if (!calendarWall) {
                console.error('Calendar wall element not found');
                return;
            }
            console.log('Calendar wall element:', calendarWall);
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
            console.log(`日曆生成完成：${year}年${monthNames[month - 1]}，共${lastDay}天`);
        }
        
        function updateCalendar(year, month) {
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
                console.log('收到的日記條目：', entries);
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

        function loadRecentDiaries() {
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

        
        function deleteDiaryEntry(entryId) {
            const now = Date.now();
            const timeElapsed = now - lastDeleteTime;

            if (timeElapsed < DELETE_COOLDOWN) {
                const remainingTime = Math.ceil((DELETE_COOLDOWN - timeElapsed) / 1000);
                showMessage(document.querySelector('.fail-message'), `Please wait ${remainingTime} seconds before deleting again.`);
                return;
            }

            if (confirm('Are you sure you want to delete this diary entry? This action cannot be undone.')) {
                const token = localStorage.getItem('token');
                if (!token) {
                    showMessage(document.querySelector('.fail-message'), 'DELETED FAIL');
                    return;
                }

                // 禁用所有刪除按鈕
                const deleteButtons = document.querySelectorAll('.delete-entry-btn');
                deleteButtons.forEach(button => button.disabled = true);

                lastDeleteTime = now; // 更新最後刪除時間

                fetch(`/delete_diary_entry/${entryId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.message) {
                        showMessage(document.querySelector('.success-message'), 'Diary entry successfully deleted');
                        loadRecentDiaries(); // 重新載入最近的日記列表
                        updateCalendar(new Date().getFullYear(), new Date().getMonth() + 1); // 更新日曆
                    } else {
                        showMessage(document.querySelector('.fail-message'), 'DELETED FAIL, PLEASE TRY AGAIN LATER');
                    }
                })
                .catch(error => {
                    console.error('錯誤:', error);
                    showMessage(document.querySelector('.fail-message'), 'AN ERROR OCCUR, PLEASE TRY AGAIN LATER');
                })
                .finally(() => {
                    // 5秒後重新啟用所有刪除按鈕
                    setTimeout(() => {
                        deleteButtons.forEach(button => button.disabled = false);
                    }, DELETE_COOLDOWN);
                });
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

    //========================= match js =================================//
    // 立即執行的登錄檢查
    (function() {
        const isLoggedIn = !!localStorage.getItem('token');
        const isMatchPage = window.location.pathname.includes('match.html');
        
        if (isMatchPage && !isLoggedIn) {
            window.location.href = '/static/index.html';
        }
    })();

    //只在exchangeBtn頁執行websocsket========

    function initializeMatchPage() {
        const exchangeBtn = document.getElementById('exchangeBtn');
        console.log('Initializing match page');
        if (exchangeBtn) {
            if (localStorage.getItem('token') && localStorage.getItem('user_id')) {
                connectWebSocket();
            }
            exchangeBtn.addEventListener('click', handleExchangeRequest);
            checkPendingRequests();
        }
        checkMatchStatus(); // 初始檢查
        // setInterval(checkMatchStatus, 60000); // 每分鐘檢查一次
    }

    // 定義 handleExchangeRequest 函數
    async function handleExchangeRequest() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/matching/request_exchange', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                showNotification('Your match request is on its way!');
                checkMatchStatus();
            } else if (data.status === 'pending') {
                showNotification('A new diary buddy is waiting!');
            } else {
                showNotification(data.message);
            }
        } catch (error) {
            console.error('Error:', error);
            showNotification('An error occurred, please try again later.');
        }
    }
    async function checkMatchStatus() {
        try {
            const token = localStorage.getItem('token');
            console.log('Checking match status...');

            const response = await fetch('/matching/status', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            console.log('Match status response:', data);

            
            if (data.status === 'accepted') {
                console.log(`Match accepted with partner ID: ${data.partner_id}`);

                if (currentPartnerId !== data.partner_id) {
                    currentPartnerId = data.partner_id;
                    showNotification(`You've been matched with user ID ${data.partner_id}!`);
                    await loadPartnerDiary(data.partner_id);
                }
            } else if (data.status === 'pending') {
                console.log('Match status is pending, will check again in 5 seconds');

                setTimeout(checkMatchStatus, 5000); // 每5秒檢查一次
            } else {
                console.log('No active match, clearing partner diary content');

                // 如果沒有匹配，清空夥伴日記區域
                currentPartnerId = null;
                const partnerDiaryContent = document.getElementById('partnerDiaryContent');
                partnerDiaryContent.innerHTML = '<p>No partner matched yet. Click EXCHANGE to find a diary buddy!</p>';
            }
        } catch (error) {
            console.error('Error in checkMatchStatus:', error);
            showNotification('An error occurred while checking match status.');
        }
    }

    async function loadPartnerDiary(partnerId) {
        console.log(`Attempting to load partner diary for partner ID: ${partnerId}`);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/get_partner_diary/${partnerId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Server response:', response.status, errorData);
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }    
    
            const data = await response.json();
            console.log('Partner diary data:', data);

            
            const partnerDiaryContent = document.getElementById('partnerDiaryContent');
            if (!partnerDiaryContent) {
                console.error('Partner diary content element not found');
                throw new Error('UI element for partner diary not found');
            }

            partnerDiaryContent.innerHTML = ''; // 清空現有內容
    
            if (data.length > 0) {
                data.forEach(entry => {
                    const entryElement = document.createElement('div');
                    entryElement.classList.add('partnerdiary-entry');
                    entryElement.innerHTML = `
                    <div class="partnerdiary-entry">
                        <div class="moodsDate">${entry.date}</div>
                        <div class="partnerdiary-content">
                            <p>${entry.content}</p>
                        </div>
                    </div>
                    `;
                    partnerDiaryContent.appendChild(entryElement);
                });
                console.log(`Rendered ${data.length} diary entries`);

            } else {
                partnerDiaryContent.innerHTML = '<p>Your partner has not written any diaries yet.</p>';
                console.log('No diary entries found for partner');
            }
        } catch (error) {
            console.error('Error loading partner diary:', error);
            const errorMessage = error.message || 'Failed to load partner diary';
            showNotification(`Error: ${errorMessage}. Please try again later.`);
            
            const partnerDiaryContent = document.getElementById('partnerDiaryContent');
            if (partnerDiaryContent) {
                partnerDiaryContent.innerHTML = `<p>Error: ${errorMessage}</p>`;
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
    
        // 將 WebSocket 實例存儲在全局變量中，以便在其他地方使用
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
        const notification = document.createElement('div');
        notification.className = 'match-request-notification';
        notification.innerHTML = `
            <p>You have a new match with "${request.user_name || 'SECRET'}" </p>
            <button class="accept-btn">ACCEPT</button>
            <button class="reject-btn">DENY</button>
        `;
        document.body.appendChild(notification);
        const acceptBtn = notification.querySelector('.accept-btn');
        const rejectBtn = notification.querySelector('.reject-btn');
        acceptBtn.addEventListener('click', () => respondToMatchRequest(request.id, 'accept'));
        rejectBtn.addEventListener('click', () => respondToMatchRequest(request.id, 'reject'));

        document.body.appendChild(notification);
    }

    window.respondToMatchRequest = async function(requestId, action) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/matching/respond/${requestId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action: action })
            });

            const data = await response.json();
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
        } catch (error) {
            console.error('Error:', error);
            showNotification('MATCH SYSTEM ERROR，PLEASE TRY AGAIN LATER。');
        }
    }


}); //DOM尾部==========================


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