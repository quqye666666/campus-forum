var currentUser = null;
var currentSection = 0;
var currentPage = 1;
var currentProfileUserId = null;
var selectedImageFiles = [];
var isLoadingPosts = false;
var hasMorePosts = true;
var bgList = [];
var bgIndex = 0;
var bgTimer = null;
var pollActive = false;
var onlineInterval = null;

(function init() {
  loadBgList();
  fetch('/api/user/me').then(function(r) { return r.json(); }).then(function(user) {
    currentUser = user;
    if (user) { showApp(); loadSections(); loadPosts(); loadPolls(); setupScroll(); }
  }).catch(function(e) { console.log('init:', e); });
})();

/* 背景轮播 */
function loadBgList() {
  bgList = [
    'L1.png', 'Bg_1.png', 'Bg_2.png', 'Bg_3.png',
    'Image_1783603396773_373.png', 'Image_1783603398046_862.jpg',
    'Image_1783603399669_799.jpg', 'Image_1783603400921_17.jpg',
    'Image_1783603402028_954.jpg', 'Image_1783603403114_16.jpg',
    'Image_1783603404413_890.jpg', 'Image_1783603405338_26.png',
    'Image_1783603406270_296.jpg', 'Image_1783603407272_733.jpg',
    'Image_1783603408242_701.jpg', 'Image_1783603409327_14.jpg',
    'Image_1783603410270_888.png', 'Image_1783603481843_736.jpg',
    'Image_1783603484450_589.jpg', 'Image_1783603486629_651.jpg',
    'Image_1783603495726_54.jpg', 'Image_1783603497332_730.jpg'
  ];
  bgIndex = Math.floor(Math.random() * bgList.length);
  applyBg();
}

function shuffleBg() {
  for (var i = bgList.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = bgList[i]; bgList[i] = bgList[j]; bgList[j] = tmp;
  }
}

function applyBg() {
  var url = '/backgrounds/' + bgList[bgIndex];
  document.body.style.backgroundImage = 'url(' + url + ')';
  var ap = document.getElementById('authPage');
  if (ap) ap.style.backgroundImage = 'url(' + url + ')';
}

/* 按钮涟漪 */
document.addEventListener('click', function(e) {
  var el = e.target;
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains('btn')) break;
    el = el.parentElement;
  }
  if (!el || el === document.body) return;
  var btn = el;
  var el = document.createElement('span');
  el.className = 'ripple';
  var r = btn.getBoundingClientRect();
  var s = Math.max(r.width, r.height);
  el.style.width = el.style.height = s + 'px';
  el.style.left = (e.clientX - r.left - s / 2) + 'px';
  el.style.top = (e.clientY - r.top - s / 2) + 'px';
  btn.appendChild(el);
  setTimeout(function() { el.remove(); }, 600);
});

/* 设备UUID（每个设备一个，防同一设备注册多个账号） */
function getDeviceUUID() {
  var key = 'campus_device_uuid';
  var uuid = localStorage.getItem(key);
  if (!uuid) {
    uuid = 'd' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(key, uuid);
  }
  return uuid;
}

/* 认证 */
function switchAuthTab(tab) {
  document.getElementById('loginTab').classList.toggle('active', tab === 'login');
  document.getElementById('registerTab').classList.toggle('active', tab === 'register');
  document.getElementById('loginForm').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('regError').style.display = 'none';
  refreshCaptcha();
}

function handleLogin(e) {
  e.preventDefault();
  var name = document.getElementById('loginName').value.trim();
  var captcha = document.getElementById('loginCaptcha').value.trim();
  var password = document.getElementById('loginPassword').value;
  var err = document.getElementById('loginError');
  if (!name) { err.textContent = '请输入用户名'; err.style.display = 'block'; return false; }
  if (!captcha) { err.textContent = '请输入图形验证码'; err.style.display = 'block'; return false; }
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, password: password, captcha: captcha })
  }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(r) {
      if (r.ok) {
        currentUser = r.data;
        showApp();
        loadSections();
        loadPosts();
        setupScroll();
      } else {
        err.textContent = r.data.error;
        err.style.display = 'block';
        refreshCaptcha();
      }
    }).catch(function(e) {
      console.log('login:', e);
      err.textContent = '网络错误，请检查服务是否正常运行';
      err.style.display = 'block';
    });
  return false;
}

function handleRegister(e) {
  e.preventDefault();
  var name = document.getElementById('regName').value.trim();
  var captcha = document.getElementById('regCaptcha').value.trim();
  var password = document.getElementById('regPassword').value;
  var confirm = document.getElementById('regConfirm').value;
  var err = document.getElementById('regError');
  if (!/^[\u4e00-\u9fa5a-zA-Z]{2,20}$/.test(name)) {
    err.textContent = '用户名须为2-20位中英文，不能含数字或特殊符号';
    err.style.display = 'block';
    return false;
  }
  if (!captcha) { err.textContent = '请输入图形验证码'; err.style.display = 'block'; return false; }
  if (password.length < 6) { err.textContent = '密码至少6位'; err.style.display = 'block'; return false; }
  if (password !== confirm) { err.textContent = '两次密码输入不一致'; err.style.display = 'block'; return false; }
  fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, password: password, captcha: captcha, deviceUUID: getDeviceUUID() })
  }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(r) {
      if (r.ok) {
        currentUser = r.data;
        showApp();
        loadSections();
        loadPosts();
        setupScroll();
      } else {
        err.textContent = r.data.error;
        err.style.display = 'block';
        refreshCaptcha();
      }
    }).catch(function(e) {
      console.log('register:', e);
      err.textContent = '网络错误，请检查服务是否正常运行';
      err.style.display = 'block';
    });
  return false;
}

function refreshCaptcha() {
  [].forEach.call(document.querySelectorAll('.captcha-img'), function(img) {
    img.src = '/api/captcha?t=' + Date.now();
  });
}

function handleLogout() {
  fetch('/api/logout', { method: 'POST' }).then(function() {
    currentUser = null;
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('appLayout').style.display = 'none';
  });
}

function showApp() {
  document.getElementById('authPage').style.display = 'none';
  document.getElementById('appLayout').style.display = 'block';
  document.getElementById('topNickname').textContent = currentUser.nickname;
  document.getElementById('topAvatar').textContent = currentUser.nickname[0];
  startOnlineCount();
}

function startOnlineCount() {
  updateOnlineCount();
  onlineInterval = setInterval(updateOnlineCount, 30000);
}

function updateOnlineCount() {
  fetch('/api/online').then(function(r) { return r.json(); }).then(function(d) {
    document.getElementById('onlineCount').textContent = '🟢 ' + d.online;
  }).catch(function() {});
}

/* 页面切换 */
function showMainPage() {
  document.getElementById('mainPage').style.display = 'block';
  document.getElementById('searchPage').style.display = 'none';
  document.getElementById('profilePage').style.display = 'none';
  document.getElementById('postComposer').style.display = '';
  document.getElementById('postsList').style.display = '';
  document.getElementById('loadingMore').style.display = '';
  currentPage = 1;
  hasMorePosts = true;
  loadPosts();
  loadPolls();
  closeDropdown();
}

function showProfile(userId) {
  document.getElementById('mainPage').style.display = 'none';
  document.getElementById('searchPage').style.display = 'none';
  document.getElementById('profilePage').style.display = 'block';
  document.getElementById('profileEditForm').classList.remove('show');
  currentProfileUserId = userId;
  loadProfile(userId);
  closeDropdown();
}

function goMyProfile(e) {
  if (e) e.stopPropagation();
  if (currentUser) showProfile(currentUser.id);
}

/* Toast */
var toastTimer;
function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.innerHTML = msg;
  t.className = 'toast show ' + (type || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.classList.remove('show'); }, 2500);
}

/* 下拉菜单 */
function toggleUserDropdown(e) {
  e.stopPropagation();
  var d = document.getElementById('userDropdown');
  var a = document.getElementById('dropdownArrow');
  d.classList.toggle('show');
  a.classList.toggle('open');
}

function closeDropdown() {
  document.getElementById('userDropdown').classList.remove('show');
  document.getElementById('dropdownArrow').classList.remove('open');
}

document.addEventListener('click', function() { closeDropdown(); });

/* 加载分区 */
var _sectionsCache;
function loadSections() {
  fetch('/api/sections').then(function(r) { return r.json(); }).then(function(sections) {
    _sectionsCache = sections;
    var nav = document.getElementById('sectionNav');
    nav.innerHTML = '<div class="nav-item active" data-section="0" onclick="selectSection(0)"><span class="icon">&#127760;</span> 全部动态</div>';
    sections.forEach(function(s) {
      nav.innerHTML += '<div class="nav-item" data-section="' + s.id + '" onclick="selectSection(' + s.id + ')"><span class="icon">' + s.icon + '</span>' + s.name + '<span class="count">' + s.post_count + '</span></div>';
    });
    var sel = document.getElementById('postSection');
    sel.innerHTML = sections.map(function(s) { return '<option value="' + s.id + '">' + s.icon + ' ' + s.name + '</option>'; }).join('');
    var hot = document.getElementById('hotSections');
    hot.innerHTML = sections.map(function(s) { return '<span class="hot-tag" onclick="selectSection(' + s.id + ')">' + s.icon + ' ' + s.name + '</span>'; }).join('');
  }).catch(function(e) { console.log('loadSections:', e); });
}

function selectSection(sid) {
  currentSection = sid;
  currentPage = 1;
  hasMorePosts = true;
  document.querySelectorAll('.nav-item').forEach(function(el) { el.classList.toggle('active', el.dataset.section == sid); });
  document.getElementById('postsList').innerHTML = '';
  document.getElementById('pollsContainer').innerHTML = '';
  if (sid === -1) {
    document.getElementById('loadingMore').style.display = 'none';
    document.getElementById('postComposer').style.display = 'none';
    loadPolls();
  } else {
    document.getElementById('loadingMore').style.display = '';
    document.getElementById('postComposer').style.display = '';
    loadPosts();
  }
  showMainPageHiddenParts();
}

function showMainPageHiddenParts() {
  document.getElementById('mainPage').style.display = 'block';
  document.getElementById('searchPage').style.display = 'none';
  document.getElementById('profilePage').style.display = 'none';
}

/* 加载帖子 */
function loadPosts() {
  if (isLoadingPosts || !hasMorePosts) return;
  isLoadingPosts = true;
  var loading = document.getElementById('loadingMore');
  loading.style.display = 'flex';

  var url = '/api/posts?page=' + currentPage + '&limit=10';
  if (currentSection > 0) url += '&section_id=' + currentSection;

  fetch(url).then(function(r) { return r.json(); }).then(function(posts) {
    loading.style.display = 'none';
    if (currentPage === 1) document.getElementById('postsList').innerHTML = '';
    if (posts.length === 0 && currentPage === 1) {
      document.getElementById('postsList').innerHTML = '<div class="empty-state"><div class="empty-icon">&#128221;</div><div class="empty-text">还没有动态，快来发布第一条吧！</div></div>';
      hasMorePosts = false;
    } else if (posts.length === 0) {
      hasMorePosts = false;
    } else {
      posts.forEach(function(p) { document.getElementById('postsList').appendChild(buildCard(p)); });
      currentPage++;
    }
  }).catch(function(e) {
    loading.style.display = 'none';
    console.log('loadPosts:', e);
  }).finally(function() { isLoadingPosts = false; });
}

function buildCard(post) {
  var div = document.createElement('div');
  div.id = 'post-' + post.id;
  var time = formatTime(parseTime(post.created_at));
  var liked = post.is_liked ? 'liked' : '';
  var fill = post.is_liked ? 'currentColor' : 'none';
  var saved = post.is_saved ? 'saved' : '';
  var ownPost = currentUser && currentUser.id === post.user_id;
  var delHtml = ownPost ?
    '<button class="action-btn" style="color:var(--danger)" onclick="deletePost(' + post.id + ')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '';
  var editHtml = ownPost ?
    '<button class="action-btn" onclick="editPost(' + post.id + ')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' : '';
  var imgHtml = '';
  if (post.image) {
    var imgs = post.image.split(',');
    var mtype = post.media_type || 'image';
    if (mtype === 'video') {
      imgHtml = '<div class="post-media">' + imgs.map(function(src) {
        return '<video src="' + src.trim() + '" controls preload="metadata"></video>';
      }).join('') + '</div>';
    } else if (mtype === 'file') {
      imgHtml = '<div class="post-media">' + imgs.map(function(src) {
        var fn = src.trim().split('/').pop();
        return '<a class="file-link" href="' + src.trim() + '" target="_blank"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>' + fn + '</a>';
      }).join('') + '</div>';
    } else {
      var col = 'col-' + Math.min(imgs.length, 9);
      imgHtml = '<div class="post-images ' + col + '">' +
        imgs.map(function(src) { return '<img src="' + src.trim() + '" alt="" loading="lazy" onclick="openLightbox(event, \'' + src.trim() + '\')">'; }).join('') +
        '</div>';
    }
  }
  var delHtml = (currentUser && currentUser.id === post.user_id) ?
    '<button class="action-btn" style="margin-left:auto;color:var(--danger)" onclick="deletePost(' + post.id + ')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>删除</button>' : '';

  var confessionBadge = post.is_anonymous ? '<span class="confession-badge">💌 表白墙 · 匿名</span>' : '';
  var cardClass = post.is_anonymous ? 'post-card confession-post' : 'post-card';
  div.className = cardClass;

  div.innerHTML =
    '<div class="post-header">' +
      '<div class="post-avatar" onclick="showProfile(' + post.user_id + ')">' + (post.is_anonymous ? '💌' : post.nickname[0]) + '</div>' +
      '<div class="post-user-info">' +
        '<div class="post-nickname" onclick="showProfile(' + post.user_id + ')">' + escapeHtml(post.nickname) + '</div>' +
        '<div class="post-time">' + time + '</div>' +
      '</div>' +
      '<span class="post-section-tag" onclick="event.stopPropagation();selectSection(' + post.section_id + ')">' + post.section_icon + ' ' + post.section_name + '</span>' +
      confessionBadge +
    '</div>' +
    '<div class="post-content">' + escapeHtml(post.content) + '</div>' + imgHtml +
    '<div class="post-actions">' +
      '<button class="action-btn ' + liked + '" onclick="toggleLike(' + post.id + ', this)">' +
        '<svg viewBox="0 0 24 24" fill="' + fill + '" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
        '<span class="lc-' + post.id + '">' + post.likes_count + '</span>' +
      '</button>' +
      '<button class="action-btn" onclick="toggleComments(' + post.id + ')">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        '<span class="cc-' + post.id + '">' + post.comments_count + '</span>' +
      '</button>' +
      '<button class="action-btn ' + saved + '" onclick="toggleSave(' + post.id + ', this)">' +
        '<svg viewBox="0 0 24 24" fill="' + (post.is_saved ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
      '</button>' +
      '<button class="action-btn" onclick="sharePost(event, ' + post.id + ')" title="分享"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>' +
      '<span style="margin-left:auto;display:flex;gap:4px">' + editHtml + delHtml + '</span>' +
    '</div>' +
    '<div class="comments-section" id="comments-' + post.id + '">' +
      '<div class="comments-list" id="cl-' + post.id + '"></div>' +
      '<div class="comment-input-area">' +
        '<input id="ci-' + post.id + '" placeholder="写评论..." onkeydown="if(event.key===\'Enter\')submitComment(' + post.id + ')">' +
        '<button class="btn btn-primary btn-sm" onclick="submitComment(' + post.id + ')">发送</button>' +
      '</div>' +
    '</div>';
  return div;
}

/* 评论 */
function toggleComments(pid) {
  var sec = document.getElementById('comments-' + pid);
  if (sec.classList.contains('show')) { sec.classList.remove('show'); return; }
  sec.classList.add('show');
  fetch('/api/posts/' + pid).then(function(r) { return r.json(); }).then(function(post) {
    var list = document.getElementById('cl-' + pid);
    if (!post.comments.length) {
      list.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0">暂无评论</div>';
    } else {
      list.innerHTML = post.comments.map(function(c) {
        return '<div class="comment-item"><div class="comment-avatar">' + c.nickname[0] + '</div><div class="comment-body"><div class="comment-nickname">' + escapeHtml(c.nickname) + '</div><div class="comment-content">' + escapeHtml(c.content) + '</div><div class="comment-time">' + formatTime(parseTime(c.created_at)) + '</div></div></div>';
      }).join('');
    }
  }).catch(function(e) { console.log('loadComments:', e); });
}

function submitComment(pid) {
  var input = document.getElementById('ci-' + pid);
  var content = input.value.trim();
  if (!content) return;
  fetch('/api/posts/' + pid + '/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content })
  }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(r) {
      if (r.ok) {
        input.value = '';
        toggleComments(pid);
        var span = document.querySelector('#post-' + pid + ' .cc-' + pid);
        if (span) span.textContent = parseInt(span.textContent) + 1;
      } else showToast(r.data.error, 'error');
    }).catch(function(e) { console.log('submitComment:', e); });
}

/* 点赞 */
function toggleLike(pid, btnEl) {
  if (!currentUser) { showToast('请先登录', 'error'); return; }
  fetch('/api/posts/' + pid + '/like', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(data) {
    var btn = btnEl;
    var svg = btn.querySelector('svg');
    var countEl = btn.querySelector('.lc-' + pid);
    if (data.liked) {
      btn.classList.add('liked');
      svg.setAttribute('fill', 'currentColor');
      countEl.textContent = parseInt(countEl.textContent) + 1;
    } else {
      btn.classList.remove('liked');
      svg.setAttribute('fill', 'none');
      countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
    }
  }).catch(function(e) { console.log('toggleLike:', e); });
}

/* 发布 */
function createPost() {
  if (pollActive) {
    createPoll();
    return;
  }
  var content = document.getElementById('postContent').value.trim();
  if (!content) { showToast('请输入内容', 'error'); return; }
  var fd = new FormData();
  fd.append('content', content);
  fd.append('section_id', document.getElementById('postSection').value);
  selectedImageFiles.forEach(function(file) { fd.append('images', file); });
  fetch('/api/posts', { method: 'POST', body: fd }).then(function(r) { return r.json(); }).then(function() {
    document.getElementById('postContent').value = '';
    removeImage();
    showToast('发布成功！', 'success');
    currentPage = 1;
    hasMorePosts = true;
    document.getElementById('postsList').innerHTML = '';
    loadPosts();
    loadSections();
  }).catch(function(e) { console.log('createPost:', e); });
}

function createPoll() {
  var question = document.getElementById('pollQuestion').value.trim();
  if (!question) { showToast('请输入投票问题', 'error'); return; }
  var inputs = document.querySelectorAll('#pollOptions input');
  var options = [];
  inputs.forEach(function(inp) {
    var v = inp.value.trim();
    if (v) options.push(v);
  });
  if (options.length < 2) { showToast('至少填写2个选项', 'error'); return; }
  fetch('/api/polls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: question, options: options })
  }).then(function(r) { return r.json(); }).then(function() {
    document.getElementById('pollQuestion').value = '';
    inputs.forEach(function(inp) { inp.value = ''; });
    togglePollForm();
    showToast('投票已发布！', 'success');
    loadPolls();
  }).catch(function(e) { console.log('createPoll:', e); });
}

/* 删除 */
function deletePost(pid) {
  if (!confirm('确定删除？')) return;
  fetch('/api/posts/' + pid, { method: 'DELETE' }).then(function(r) { return r.json(); }).then(function() {
    var card = document.getElementById('post-' + pid);
    if (card) { card.style.opacity = '0'; card.style.transform = 'scale(0.95)'; card.style.transition = 'all 0.3s'; setTimeout(function() { card.remove(); }, 300); }
    showToast('已删除', 'success');
  }).catch(function(e) { console.log('deletePost:', e); });
}

/* 收藏 */
function toggleSave(pid, btn) {
  if (!currentUser) { showToast('请先登录', 'error'); return; }
  fetch('/api/posts/' + pid + '/save', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    var svg = btn.querySelector('svg');
    if (d.saved) { btn.classList.add('saved'); svg.setAttribute('fill', 'currentColor'); showToast('已收藏', 'success'); }
    else { btn.classList.remove('saved'); svg.setAttribute('fill', 'none'); }
  });
}

/* 分享 */
function sharePost(e, pid) {
  e.stopPropagation();
  var url = location.origin + '/?post=' + pid;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function() { showToast('链接已复制', 'success'); });
  } else {
    var input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('链接已复制', 'success');
  }
}

/* 编辑 */
function editPost(pid) {
  var card = document.getElementById('post-' + pid);
  var contentEl = card.querySelector('.post-content');
  var origText = contentEl.textContent;
  contentEl.innerHTML = '<textarea id="editArea-' + pid + '" style="width:100%;min-height:80px;border:1px solid var(--border);border-radius:8px;padding:10px;font-size:14px;font-family:inherit;resize:vertical;outline:none">' + escapeHtml(origText) + '</textarea><div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-primary btn-sm" onclick="saveEdit(' + pid + ')">保存</button><button class="btn btn-outline btn-sm" onclick="cancelEdit(' + pid + ', \'' + escapeHtml(origText).replace(/'/g, '\\\'') + '\')">取消</button></div>';
}

function saveEdit(pid) {
  var content = document.getElementById('editArea-' + pid).value.trim();
  if (!content) { showToast('内容不能为空', 'error'); return; }
  fetch('/api/posts/' + pid, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content })
  }).then(function(r) { return r.json(); }).then(function() {
    var card = document.getElementById('post-' + pid);
    card.querySelector('.post-content').innerHTML = escapeHtml(content);
    showToast('已更新', 'success');
  });
}

function cancelEdit(pid, origText) {
  document.getElementById('post-' + pid).querySelector('.post-content').innerHTML = origText;
}

/* 图片 */
function previewImages() {
  var files = document.getElementById('imageInput').files;
  if (!files.length) return;
  for (var i = 0; i < files.length; i++) {
    selectedImageFiles.push(files[i]);
  }
  var container = document.getElementById('previewImages');
  container.innerHTML = '';
  for (var j = 0; j < selectedImageFiles.length; j++) {
    (function(file) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = document.createElement('img');
        img.src = e.target.result;
        container.appendChild(img);
      };
      reader.readAsDataURL(file);
    })(selectedImageFiles[j]);
  }
  container.className = 'preview-grid';
  document.getElementById('imagePreview').style.display = 'block';
  document.getElementById('imageInput').value = '';
}
function removeImage() {
  selectedImageFiles = [];
  document.getElementById('imageInput').value = '';
  document.getElementById('previewImages').innerHTML = '';
  document.getElementById('imagePreview').style.display = 'none';
}

/* 个人主页 */
function loadProfile(uid) {
  fetch('/api/user/' + uid).then(function(r) { return r.json(); }).then(function(user) {
    if (!user) return;
    var avEl = document.getElementById('profileAvatar');
    var avImg = document.getElementById('profileAvatarImg');
    if (user.avatar_url) {
      avEl.style.display = 'none';
      avImg.style.display = '';
      avImg.src = user.avatar_url;
    } else {
      avEl.style.display = '';
      avImg.style.display = 'none';
      avEl.textContent = user.nickname[0];
    }
    document.getElementById('profileName').textContent = user.nickname;
    document.getElementById('profileSchool').textContent = user.school || '未填写学校';
    document.getElementById('profileBio').textContent = user.bio || '这个人很懒...';
    document.getElementById('profilePostCount').textContent = user.postCount || 0;

    var genderEl = document.getElementById('profileGender');
    genderEl.textContent = user.gender || '';
    genderEl.className = 'gender-tag' + (user.gender ? '' : '');
    if (!user.gender) genderEl.style.display = 'none'; else genderEl.style.display = '';

    var gradeEl = document.getElementById('profileGrade');
    gradeEl.textContent = user.grade || '';
    gradeEl.className = 'grade-tag';
    if (!user.grade) gradeEl.style.display = 'none'; else gradeEl.style.display = '';

    var bdayEl = document.getElementById('profileBirthday');
    bdayEl.textContent = user.birthday ? '生日: ' + user.birthday : '';

    var zodEl = document.getElementById('profileZodiac');
    zodEl.textContent = user.zodiac || '';
    zodEl.className = 'zodiac-tag';
    if (!user.zodiac) zodEl.style.display = 'none'; else zodEl.style.display = '';

    var uploadBtn = document.getElementById('avatarUploadBtn');
    if (currentUser && currentUser.id === user.id) {
      uploadBtn.style.display = '';
    } else {
      uploadBtn.style.display = 'none';
    }

    var acts = document.getElementById('profileActions');
    if (currentUser && currentUser.id === user.id) {
      acts.innerHTML = '<button class="btn btn-outline btn-sm" onclick="toggleEditProfile()">编辑资料</button>';
      document.getElementById('editNickname').value = user.nickname;
      document.getElementById('editSchool').value = user.school || '';
      document.getElementById('editBio').value = user.bio || '';
      document.getElementById('editBirthday').value = user.birthday || '';
      document.getElementById('editGender').value = user.gender || '';
      document.getElementById('editGrade').value = user.grade || '';
      document.getElementById('editSignature').value = user.signature || '';
      updateZodiacPreview();
    } else if (currentUser) {
      acts.innerHTML = '<button class="btn btn-primary btn-sm follow-btn" id="followBtn" onclick="toggleFollow(' + user.id + ')">关注</button>' +
        '<button class="btn btn-outline btn-sm" style="margin-left:6px" onclick="showChatWith(' + user.id + ')">私信</button>' +
        '<button class="btn btn-outline btn-sm" style="margin-left:6px;color:var(--danger)" id="blockBtn" onclick="toggleBlock(' + user.id + ')">拉黑</button>';
      checkFollow(user.id);
      checkBlockStatus(user.id);
    } else {
      acts.innerHTML = '';
    }

    fetch('/api/user/' + uid + '/posts').then(function(r) { return r.json(); }).then(function(posts) {
      var c = document.getElementById('profilePosts');
      if (!posts.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128236;</div><div class="empty-text">还没有发布过动态</div></div>'; }
      else { c.innerHTML = posts.map(function(p) { return buildCard(p).outerHTML; }).join(''); }
    });
  }).catch(function(e) { console.log('loadProfile:', e); });
}

function updateZodiacPreview() {
  var bday = document.getElementById('editBirthday').value;
  var zodEl = document.getElementById('editZodiac');
  if (!bday) { zodEl.value = ''; return; }
  var parts = bday.split('-');
  var m = parseInt(parts[1]), d = parseInt(parts[2]);
  var zodiacs = ['摩羯','水瓶','双鱼','白羊','金牛','双子','巨蟹','狮子','处女','天秤','天蝎','射手'];
  var cuts = [20,19,21,20,21,22,23,23,23,24,23,22];
  var idx = m - 1;
  if (d > cuts[idx]) idx = (idx + 1) % 12;
  zodEl.value = zodiacs[idx] + '座';
}

document.addEventListener('change', function(e) {
  if (e.target.id === 'editBirthday') updateZodiacPreview();
});

function toggleEditProfile() { document.getElementById('profileEditForm').classList.toggle('show'); }

function saveProfile() {
  var n = document.getElementById('editNickname').value;
  var s = document.getElementById('editSchool').value;
  var b = document.getElementById('editBio').value;
  var bday = document.getElementById('editBirthday').value;
  var g = document.getElementById('editGender').value;
  var gr = document.getElementById('editGrade').value;
  var sig = document.getElementById('editSignature').value;
  var pwd = document.getElementById('editPassword').value;
  fetch('/api/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: n, school: s, bio: b, birthday: bday, gender: g, grade: gr, signature: sig })
  }).then(function(r) { return r.json(); }).then(function() {
    if (pwd) {
      return fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
    }
  }).then(function() {
    document.getElementById('editPassword').value = '';
    showToast('资料已更新', 'success');
    currentUser.nickname = n;
    document.getElementById('topNickname').textContent = n;
    document.getElementById('topAvatar').textContent = n[0];
    document.getElementById('profileEditForm').classList.remove('show');
    loadProfile(currentUser.id);
  }).catch(function(e) { console.log('saveProfile:', e); });
}

/* 头像上传 */
function uploadAvatar() {
  var file = document.getElementById('avatarInput').files[0];
  if (!file) return;
  var fd = new FormData();
  fd.append('avatar', file);
  fetch('/api/user/avatar', { method: 'POST', body: fd }).then(function(r) { return r.json(); }).then(function(d) {
    document.getElementById('profileAvatar').style.display = 'none';
    var img = document.getElementById('profileAvatarImg');
    img.style.display = '';
    img.src = d.avatar_url;
    showToast('头像已更新', 'success');
    loadProfile(currentUser.id);
  }).catch(function(e) { console.log('uploadAvatar:', e); });
}

function checkFollow(uid) {
  fetch('/api/follow/' + uid + '/status').then(function(r) { return r.json(); }).then(function(d) {
    var btn = document.getElementById('followBtn');
    if (!btn) return;
    btn.textContent = d.following ? '已关注' : '关注';
    btn.className = 'btn btn-sm ' + (d.following ? 'btn-outline' : 'btn-primary');
  });
}

function toggleFollow(uid) {
  fetch('/api/follow/' + uid, { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    var btn = document.getElementById('followBtn');
    if (!btn) return;
    btn.textContent = d.following ? '已关注' : '关注';
    btn.className = 'btn btn-sm ' + (d.following ? 'btn-outline' : 'btn-primary');
    showToast(d.following ? '已关注' : '已取消关注', 'success');
  }).catch(function(e) { console.log('follow:', e); });
}

/* 搜索 */
function searchPosts() {
  var q = document.getElementById('searchInput').value.trim();
  if (!q) return;
  showMainPageHiddenParts();
  document.getElementById('mainPage').style.display = 'none';
  document.getElementById('searchPage').style.display = 'block';
  var c = document.getElementById('searchResults');
  c.innerHTML = '<div class="loading-more"><div class="spinner"></div>搜索中...</div>';
  fetch('/api/search?q=' + encodeURIComponent(q)).then(function(r) { return r.json(); }).then(function(posts) {
    if (!posts.length) { c.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128269;</div><div class="empty-text">没有找到相关帖子</div></div>'; }
    else { c.innerHTML = posts.map(function(p) { return buildCard(p).outerHTML; }).join(''); }
  }).catch(function(e) { console.log('search:', e); });
}

/* 无限滚动 */
function setupScroll() {
  window.addEventListener('scroll', function() {
    var mp = document.getElementById('mainPage');
    if (mp.style.display === 'none') return;
    if (isLoadingPosts || !hasMorePosts) return;
    var lm = document.getElementById('loadingMore');
    if (lm.getBoundingClientRect().top <= window.innerHeight + 300) loadPosts();
  });
}

/* 工具 */
function formatTime(d) {
  var diff = new Date() - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return d.toLocaleDateString('zh-CN');
}

function chatTime(d) {
  var now = new Date();
  var diff = now - d;
  var h = ('0' + d.getHours()).slice(-2);
  var m = ('0' + d.getMinutes()).slice(-2);
  var today = new Date();
  if (diff < 86400000 && d.getDate() === today.getDate() && d.getMonth() === today.getMonth()) return h + ':' + m;
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + h + ':' + m;
}

function parseTime(str) {
  if (!str) return new Date();
  var d = new Date(str.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) d = new Date(str);
  return d;
}

function escapeHtml(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* 灯箱 */
function openLightbox(e, src) {
  e.stopPropagation();
  var lb = document.getElementById('lightbox');
  document.getElementById('lightboxImg').src = src;
  lb.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('show');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeLightbox(); closeNewGroup(); }
});

/* 拉黑 */
var chatTarget = null;
var chatTargetType = 'user';

function checkBlockStatus(uid) {
  fetch('/api/block/' + uid + '/status').then(function(r) { return r.json(); }).then(function(d) {
    var btn = document.getElementById('blockBtn');
    if (btn) { btn.textContent = d.blocked ? '已拉黑' : '拉黑'; btn.style.color = d.blocked ? '' : 'var(--danger)'; }
  });
}

function toggleBlock(uid) {
  fetch('/api/block/' + uid, { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    var btn = document.getElementById('blockBtn');
    if (btn) { btn.textContent = d.blocked ? '已拉黑' : '拉黑'; btn.style.color = d.blocked ? '' : 'var(--danger)'; }
    showToast(d.blocked ? '已拉黑' : '已取消拉黑', 'success');
  });
}

/* 聊天 */
function showChat() {
  hideAll();
  document.getElementById('chatPage').style.display = 'block';
  loadConversations();
  closeDropdown();
}

function showChatWith(uid) {
  hideAll();
  document.getElementById('chatPage').style.display = 'block';
  loadConversations();
  openChatUser(uid);
}

function hideAll() {
  document.getElementById('mainPage').style.display = 'none';
  document.getElementById('profilePage').style.display = 'none';
  document.getElementById('searchPage').style.display = 'none';
}

function closeChat() {
  document.getElementById('chatPage').style.display = 'none';
  if (currentProfileUserId) {
    showProfile(currentProfileUserId);
  } else {
    showMainPage();
  }
  chatTarget = null;
  document.getElementById('chatMessages').innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-text">选择一个对话开始聊天</div></div>';
  document.getElementById('chatInputArea').style.display = 'none';
}

function loadConversations() {
  fetch('/api/conversations').then(function(r) { return r.json(); }).then(function(data) {
    var list = document.getElementById('conversationList');
    list.innerHTML = '<div style="padding:10px 16px;font-size:13px;color:var(--text-secondary);border-bottom:1px solid var(--border)">好友对话</div>';
    if (data.users.length === 0) {
      list.innerHTML += '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">暂无对话</div>';
    } else {
      data.users.forEach(function(u) {
        list.innerHTML += '<div class="conv-item" onclick="openChatUser(' + u.id + ',\'' + escapeHtml(u.nickname).replace(/'/g, "\\'") + '\')"><div class="conv-avatar">' + u.nickname[0] + '</div><div class="conv-info"><div class="conv-name">' + escapeHtml(u.nickname) + '</div><div class="conv-last">' + (u.last_msg || '') + '</div></div></div>';
      });
    }
    var glist = document.getElementById('groupList');
    glist.innerHTML = '<div style="padding:10px 16px;font-size:13px;color:var(--text-secondary);border-bottom:1px solid var(--border);border-top:1px solid var(--border)">群聊</div>';
    if (data.groups.length === 0) {
      glist.innerHTML += '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">暂无群聊</div>';
    } else {
      data.groups.forEach(function(g) {
        glist.innerHTML += '<div class="conv-item" onclick="openChatGroup(' + g.id + ', \'' + escapeHtml(g.name).replace(/'/g, "\\'") + '\')"><div class="conv-avatar" style="background:#34c759">群</div><div class="conv-info"><div class="conv-name">' + escapeHtml(g.name) + '</div><div class="conv-last">' + (g.last_msg || '') + '</div></div></div>';
      });
    }
  }).catch(function(e) { console.log('conversations:', e); });
}

function openChatUser(uid, name) {
  chatTarget = uid;
  chatTargetType = 'user';
  document.getElementById('chatTitle').textContent = '与 ' + (name || '用户') + ' 的对话';
  document.getElementById('chatInputArea').style.display = 'block';
  loadMessages();
}

function openChatGroup(gid, name) {
  chatTarget = gid;
  chatTargetType = 'group';
  document.getElementById('chatTitle').textContent = name;
  document.getElementById('chatInputArea').style.display = 'block';
  loadMessages();
}

function loadMessages() {
  if (!chatTarget) return;
  var url = chatTargetType === 'group' ? '/api/groups/' + chatTarget + '/messages' : '/api/messages/' + chatTarget;
  fetch(url).then(function(r) { return r.json(); }).then(function(msgs) {
    var container = document.getElementById('chatMessages');
    container.innerHTML = '';
    msgs.forEach(function(m) { container.appendChild(buildChatMsg(m)); });
    container.scrollTop = container.scrollHeight;
    markRead();
  });
}

function markRead() {
  var body = {};
  if (chatTargetType === 'group') body.group_id = chatTarget;
  else body.sender_id = chatTarget;
  fetch('/api/messages/read', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function buildChatMsg(m) {
  var div = document.createElement('div');
  div.className = 'chat-msg' + (m.sender_id === currentUser.id ? ' mine' : '');
  var time = chatTime(parseTime(m.created_at));
  var fileHtml = '';
  if (m.file_url) {
    if (m.file_type === 'image') {
      fileHtml = '<div class="msg-file"><img src="' + m.file_url + '" onclick="openLightbox(event,\'' + m.file_url + '\')"></div>';
    } else if (m.file_type === 'video') {
      fileHtml = '<div class="msg-file"><video src="' + m.file_url + '" controls width="200"></video></div>';
    } else {
      fileHtml = '<div class="msg-file"><a href="' + m.file_url + '" target="_blank">📎 ' + (m.file_name || '文件') + '</a></div>';
    }
  }
  var readMark = '';
  if (m.sender_id === currentUser.id && m.is_read) readMark = ' 已读';
  div.innerHTML = '<div class="msg-avatar" onclick="showProfile(' + m.sender_id + ')" title="查看主页">' + (m.sender_nickname || '')[0] + '</div><div><div class="msg-bubble">' + (m.content ? escapeHtml(m.content) : '') + fileHtml + '<div class="msg-time">' + time + readMark + '</div></div></div>';
  return div;
}

function sendChatMessage() {
  if (!chatTarget) return;
  var input = document.getElementById('chatInput');
  var content = input.value.trim();
  if (!content) return;
  var body = { content: content };
  if (chatTargetType === 'group') body.group_id = chatTarget;
  else body.receiver_id = chatTarget;
  fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); }).then(function(r) {
    if (r.ok) { input.value = ''; loadMessages(); loadConversations(); }
    else if (r.data.error && r.data.error.indexOf('互关') !== -1) {
      showToast(r.data.error + ' <a href="#" onclick="event.preventDefault();quickFollow(' + chatTarget + ')" style="color:#fff;text-decoration:underline;font-weight:700">点击互关</a>', 'error');
    }
    else showToast(r.data.error, 'error');
  });
}

function sendChatFile() {
  if (!chatTarget) return;
  var file = document.getElementById('chatFileInput').files[0];
  if (!file) return;
  var fd = new FormData();
  fd.append('file', file);
  fd.append('content', '');
  if (chatTargetType === 'group') fd.append('group_id', chatTarget);
  else fd.append('receiver_id', chatTarget);
  fetch('/api/messages', { method: 'POST', body: fd }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); }).then(function(r) {
    if (r.ok) { loadMessages(); loadConversations(); }
    else if (r.data.error && r.data.error.indexOf('互关') !== -1) {
      showToast(r.data.error + ' <a href="#" onclick="event.preventDefault();quickFollow(' + chatTarget + ')" style="color:#fff;text-decoration:underline;font-weight:700">点击互关</a>', 'error');
    }
    else showToast(r.data.error, 'error');
  });
}

/* 快捷互关 */
function quickFollow(uid) {
  fetch('/api/follow/' + uid, { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    showToast(d.following ? '已关注！请等待对方也关注你即可畅聊' : '已取消关注', 'success');
  }).catch(function(e) { showToast('操作失败', 'error'); });
}

/* 群聊 */
function showNewGroup() {
  document.getElementById('newGroupModal').style.display = 'flex';
}

function closeNewGroup() {
  document.getElementById('newGroupModal').style.display = 'none';
}

function createGroup() {
  var name = document.getElementById('groupName').value.trim();
  var membersStr = document.getElementById('groupMembers').value.trim();
  if (!name) { showToast('请输入群名称', 'error'); return; }
  var memberIds = membersStr ? membersStr.split(',').map(function(s) { return parseInt(s.trim()); }).filter(function(n) { return n > 0; }) : [];
  fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, member_ids: memberIds })
  }).then(function(r) { return r.json(); }).then(function() {
    closeNewGroup();
    document.getElementById('groupName').value = '';
    document.getElementById('groupMembers').value = '';
    loadConversations();
    showToast('群聊已创建', 'success');
  });
}

/* 投票功能 */
function togglePollForm() {
  pollActive = !pollActive;
  document.getElementById('pollForm').style.display = pollActive ? 'block' : 'none';
}

function addPollOption() {
  var row = document.createElement('div');
  row.className = 'poll-option-row';
  var n = document.querySelectorAll('#pollOptions input').length + 1;
  row.innerHTML = '<input type="text" placeholder="选项 ' + n + '"><span class="poll-opt-remove" onclick="removePollOption(this)">✕</span>';
  document.getElementById('pollOptions').appendChild(row);
}

function removePollOption(el) {
  var rows = document.querySelectorAll('#pollOptions .poll-option-row');
  if (rows.length <= 2) { showToast('至少需要2个选项', 'error'); return; }
  el.parentElement.remove();
}

function loadPolls() {
  fetch('/api/polls').then(function(r) { return r.json(); }).then(function(polls) {
    var target = currentSection === -1 ? document.getElementById('postsList') : document.getElementById('pollsContainer');
    if (!target) return;
    if (!polls.length) {
      target.innerHTML = currentSection === -1 ? '<div class="empty-state"><div class="empty-icon">&#128202;</div><div class="empty-text">暂无投票</div></div>' : '';
      return;
    }
    target.innerHTML = polls.map(function(p) { return buildPollCard(p); }).join('');
  }).catch(function(e) { console.log('loadPolls:', e); });
}

function buildPollCard(poll) {
  var voted = poll.my_vote !== null;
  var opts = poll.options_with_votes;
  var total = poll.total_votes || 1;
  var optsHtml = opts.map(function(o, i) {
    var pct = Math.round(o.count / total * 100);
    var bar = voted ? '<div class="poll-bar"><div class="poll-bar-fill" style="width:' + pct + '%"></div></div>' : '';
    var cls = poll.my_vote === i ? 'poll-opt voted' : 'poll-opt';
    return '<div class="' + cls + '" onclick="votePoll(' + poll.id + ', ' + i + ')">' +
      '<span>' + escapeHtml(o.option) + '</span>' +
      (voted ? '<span class="poll-vote-count">' + o.count + ' 票 (' + pct + '%)</span>' : '') +
      bar + '</div>';
  }).join('');
  return '<div class="post-card poll-card" id="poll-' + poll.id + '">' +
    '<div class="poll-badge">📊 投票</div>' +
    '<div class="poll-question">' + escapeHtml(poll.question) + '</div>' +
    '<div class="poll-options">' + optsHtml + '</div>' +
    '<div class="poll-meta">由 ' + escapeHtml(poll.nickname) + ' 发起 · ' + total + ' 人投票</div>' +
    '</div>';
}

function votePoll(pollId, optIndex) {
  if (!currentUser) { showToast('请先登录', 'error'); return; }
  fetch('/api/polls/' + pollId + '/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ option_index: optIndex })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) { showToast(d.error, 'error'); return; }
    showToast('投票成功！', 'success');
    loadPolls();
  }).catch(function(e) { console.log('votePoll:', e); });
}

/* ========== yzrt 组件交互 ========== */

/* launch start 悬浮按钮 → 打开发帖框并聚焦 */
function openComposer() {
  var c = document.querySelector('.post-composer');
  if (c) {
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var ta = c.querySelector('textarea');
    if (ta) setTimeout(function() { ta.focus(); }, 350);
  }
}

/* 设置弹层 */
function openSettings() { document.getElementById('settingsModal').classList.add('show'); }
function closeSettings() { document.getElementById('settingsModal').classList.remove('show'); }

/* Pro 弹窗 */
function openPro() { document.getElementById('proModal').classList.add('show'); }
function closePro() { document.getElementById('proModal').classList.remove('show'); }

/* 点击弹层遮罩关闭 */
document.querySelectorAll('.yzrt-modal').forEach(function(m) {
  m.addEventListener('click', function(e) { if (e.target === m) m.classList.remove('show'); });
});

/* 真实拟态旋钮：拖动调节背景模糊度 (0~20px) */
(function initKnob() {
  var knob = document.getElementById('blurKnob');
  if (!knob) return;
  var handle = knob.querySelector('.knob-handle');
  var dragging = false, startY = 0, startBlur = 7;

  function setBlur(v) {
    v = Math.max(0, Math.min(20, v));
    document.documentElement.style.setProperty('--bg-blur', v + 'px');
    var ang = -135 + (v / 20) * 270;
    handle.style.transform = 'rotate(' + ang + 'deg)';
  }
   setBlur(0);

  knob.addEventListener('mousedown', function(e) {
    dragging = true; startY = e.clientY;
    startBlur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bg-blur')) || 7;
    e.preventDefault();
  });
  window.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var delta = (startY - e.clientY) / 4;
    setBlur(startBlur + delta);
  });
  window.addEventListener('mouseup', function() { dragging = false; });

  /* 触屏 */
  knob.addEventListener('touchstart', function(e) {
    dragging = true; startY = e.touches[0].clientY;
    startBlur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bg-blur')) || 7;
  }, { passive: true });
  window.addEventListener('touchmove', function(e) {
    if (!dragging) return;
    var delta = (startY - e.touches[0].clientY) / 4;
    setBlur(startBlur + delta);
  }, { passive: true });
  window.addEventListener('touchend', function() { dragging = false; });
})();

