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

//diary面頁開始
document.addEventListener('DOMContentLoaded', (event) => {
    console.log('DOM fully loaded and parsed');
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
  
    function updateLoginButtonText() {
      if (loginBtn) {
        loginBtn.textContent = isLoggedIn ? 'Sign out' : 'Sign in';
        console.log('Button text updated:', loginBtn.textContent);
        } else {
        console.error('Login button not found');
        }
    }
  
    updateLoginButtonText();
  
    if (loginBtn) {
      loginBtn.onclick = function() {
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
      updateLoginButtonText();
      console.log('Sign out');
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
            localStorage.setItem('token', data.token);
            showMessage(successLoginMessage, 'Sign in successfully');
            setTimeout(() => {
              closeModals();
              isLoggedIn = true;
              updateLoginButtonText();
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
      //日記保存
    const saveDiaryBtn = document.getElementById('saveDiaryBtn');
    const diaryContent = document.getElementById('diaryContent');

    if (saveDiaryBtn) {
        saveDiaryBtn.addEventListener('click', saveDiaryEntry);
    }

    function saveDiaryEntry() {        
        const content = diaryContent.value;
        const token = localStorage.getItem('token');

        if (!token) {
            showMessage(document.querySelector('.fail-message'), 'Please sign in first');
            showLoginModal();
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        fetch('/create_diary_entry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: "Today's Diary",
                content: content,
                date: today,
                is_public: false
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.id) {
                showMessage(document.querySelector('.success-message'), 'Diary saved successfully!');
                diaryContent.value = '';
                updateCalendar();
            } else {
                showMessage(document.querySelector('.fail-message'), 'Failed to save. Please try again later.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showMessage(document.querySelector('.fail-message'), 'An error occurred. Please try again later.');
        });
    }

    function updateCalendar() {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log('No token found, using test data');
            return;
        }

        fetch('/get_diary_entries', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    throw new Error(`HTTP error! status: ${response.status}, message: ${text}`);
                });
            }
            return response.json();
        })
        .then(entries => {
            console.log('Received entries:', entries);
            const calendarDays = document.querySelectorAll('.calendar-day');
            calendarDays.forEach(day => {
                const dayNumber = parseInt(day.querySelector('.calendar-day-content').textContent);
                const hasEntry = entries.some(entry => new Date(entry.date).getDate() === dayNumber);
                if (hasEntry) {
                    day.classList.add('has-entry');
                } else {
                    day.classList.remove('has-entry');
                }
            });
        })
        .catch(error => {
            console.error('Error fetching diary entries:', error);
        });
    }

    // 在頁面加載時更新日曆
    updateCalendar();
    
  
    function showMessage(element, message) {
        if (element) {
            const translations = {
              '登入失敗，帳號或密碼錯誤或其他原因': 'You have entered an invalid username or password',
              '註冊失敗，重複的 Email 或其他原因': 'Registration failed, please check email and password'
            };
            element.textContent = translations[message] || message;
            element.style.display = 'block';
            setTimeout(() => {
              element.style.display = 'none';
            }, 2000);
          } else {
            console.error('Message element not found:', message);
          }
        }
      
  
    // Check login status on page load
    const token = localStorage.getItem('token');
    if (!token && window.location.pathname === '/booking') {
      showLoginModal();
    }

    function generateCalendar() {
        const calendarWall = document.querySelector('.calendar-wall');
        if (!calendarWall) {
            console.error('Calendar wall element not found');
            return;
        }
        calendarWall.innerHTML = ''; // 清空現有內容
        const daysInMonth = 31; // 假設是31天的月份

        for (let i = 1; i <= daysInMonth; i++) {
            const dayElement = document.createElement('div');
            dayElement.classList.add('calendar-day');
            
            const dayContent = document.createElement('div');
            dayContent.classList.add('calendar-day-content');
            dayContent.textContent = i;
            
            // 模擬一些日期已有日記條目
            if (i % 3 === 0) {
                dayElement.classList.add('has-entry');
            }

            dayElement.appendChild(dayContent);
            calendarWall.appendChild(dayElement);
        }
        console.log('Calendar generated with', daysInMonth, 'days');
    }
    generateCalendar();
    console.log('generateCalendar function has been called');
    updateCalendar();
});                         //監聽尾部=============================

  
    