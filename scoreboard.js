/*
 * Scoreboard App Script
 *
 * This script loads scoreboard data from a JSON file and renders a simple
 * classroom points dashboard. It supports three views: group leaderboard,
 * student leaderboard with search and filter, and an individual profile
 * viewer where students can enter a private code to see their own totals
 * and recent transactions. Data structures are kept simple for the sake
 * of classroom experiments; in a production setting you would likely
 * replace the JSON fetch with calls to a real backend or database.
 */

// Global variable to hold loaded data. It will be populated from an embedded
// <script id="scoreboard-data"> in the HTML. This avoids file fetch
// restrictions when opening the app from a local file (file:// scheme).
let scoreboardData = null;

// Map of groups keyed by ID for quick lookups and their properties (e.g. colour)
let groupById = {};

// -----------------------------------------------------------------------------
//  Pets Helpers
//
// The scoreboard can display special "pets" that groups unlock when their
// cumulative points reach certain thresholds. Each pet is defined in the
// embedded scoreboard data with an id, name, threshold and either an emoji or
// image. The helpers below determine which pets a group has earned based on
// their point total and build DOM elements to represent earned or locked pets.

/**
 * Given a number of points and a list of pets, separate the pets into two
 * arrays: those that are earned and those that remain locked. Pets are sorted
 * by threshold ascending so that lower thresholds appear first.
 *
 * @param {number} points - The total points for a group.
 * @param {Array} pets - Array of pet objects from scoreboardData.pets.
 * @returns {{earned: Array, locked: Array}}
 */
function petsEarnedForPoints(points, pets) {
  const earned = [];
  const locked = [];
  (pets || []).forEach((p) => {
    const threshold = p.threshold || 0;
    if (typeof points === 'number' && points >= threshold) {
      earned.push(p);
    } else {
      locked.push(p);
    }
  });
  // Sort each list by threshold ascending for consistent display
  earned.sort((a, b) => (a.threshold || 0) - (b.threshold || 0));
  locked.sort((a, b) => (a.threshold || 0) - (b.threshold || 0));
  return { earned, locked };
}

/**
 * Create a DOM element representing a single pet. Earned pets are shown
 * normally, while locked pets are grayed out and display the threshold
 * required to unlock them.
 *
 * @param {Object} pet - Pet definition from scoreboardData.pets.
 * @param {boolean} isLocked - Whether the pet is locked.
 * @returns {HTMLElement}
 */
function createPetChip(pet, isLocked) {
  const el = document.createElement('span');
  el.className = 'pet' + (isLocked ? ' locked' : '');
  // Add a tooltip using the description if provided
  if (pet.desc) {
    el.title = `${pet.name} — ${pet.desc}`;
  } else {
    el.title = pet.name;
  }
  // Icon container
  const icon = document.createElement('span');
  icon.className = 'icon';
  // Prefer an image if provided; otherwise fall back to emoji
  if (pet.img) {
    const img = document.createElement('img');
    img.src = pet.img;
    img.alt = pet.name;
    img.width = 20;
    img.height = 20;
    img.style.verticalAlign = 'middle';
    icon.appendChild(img);
  } else {
    icon.textContent = pet.emoji || '⭐';
  }
  el.appendChild(icon);
  // Name label
  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';
  nameSpan.textContent = pet.name;
  el.appendChild(nameSpan);
  // If locked, show threshold required
  if (isLocked) {
    const thr = document.createElement('span');
    thr.className = 'thr';
    thr.textContent = ` (${pet.threshold} pts)`;
    el.appendChild(thr);
  }
  return el;
}

// Initialize once the DOM has loaded. This parses the embedded JSON,
// populates the group filter, and renders all views.
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Parse embedded data
    const dataScript = document.getElementById('scoreboard-data');
    if (!dataScript) {
      throw new Error('No scoreboard data script found');
    }
    scoreboardData = JSON.parse(dataScript.textContent);
    // Build a lookup table for groups by ID
    groupById = {};
    scoreboardData.groups.forEach((g) => {
      groupById[g.id] = g;
    });
    // Populate group filter dropdown
    populateGroupFilter();
    // Populate class (hour) filter dropdown if present
    populateClassFilter();
    // Render views
    renderGroupLeaderboard();
    renderStudentLeaderboard();
    setupProfileLookup();
    setupTabSwitching();
  } catch (err) {
    console.error('Failed to initialize scoreboard:', err);
    // Show a generic message to the user if the app fails to initialize. Details are logged in the console.
    alert('Unable to initialize scoreboard app. Please check the console for details.');
  }
});

// Compute total points for each group
function computeGroupTotals() {
  const totals = {};
  scoreboardData.groups.forEach((g) => {
    totals[g.id] = 0;
  });
  scoreboardData.transactions.forEach((t) => {
    if (totals.hasOwnProperty(t.groupId)) {
      totals[t.groupId] += t.delta;
    }
  });
  return totals;
}

// Compute total points for each student
function computeStudentTotals() {
  const totals = {};
  scoreboardData.students.forEach((s) => {
    totals[s.id] = 0;
  });
  scoreboardData.transactions.forEach((t) => {
    if (totals.hasOwnProperty(t.studentId)) {
      totals[t.studentId] += t.delta;
    }
  });
  return totals;
}

// Render the group leaderboard
function renderGroupLeaderboard() {
  const container = document.getElementById('groupsList');
  container.innerHTML = '';
  const totals = computeGroupTotals();
  // Sort groups by total descending
  const sorted = scoreboardData.groups.slice().sort((a, b) => {
    return (totals[b.id] || 0) - (totals[a.id] || 0);
  });
  sorted.forEach((g) => {
    const card = document.createElement('div');
    // Apply group accent class for coloured stripe and tint via CSS
    card.className = 'card group-accent';
    // Tag the element with its group ID so CSS can determine its colours
    card.setAttribute('data-group', g.id);
    const points = totals[g.id] || 0;
    const motto = g.motto ? `<p class="small">${g.motto}</p>` : '';
    card.innerHTML = `
      <h3>${g.name}</h3>
      ${motto}
      <p><strong>${points}</strong> points</p>
    `;
    // Colour the heading using the group colour for an extra pop
    const h3 = card.querySelector('h3');
    if (h3) {
      h3.style.color = g.color;
    }
    // If pets are defined, append a row of pet chips indicating earned and locked pets
    if (scoreboardData && Array.isArray(scoreboardData.pets) && scoreboardData.pets.length > 0) {
      const { earned, locked } = petsEarnedForPoints(points, scoreboardData.pets);
      const petsRow = document.createElement('div');
      petsRow.className = 'pets-row';
      // Add earned pets first, then locked ones
      earned.forEach((pet) => {
        petsRow.appendChild(createPetChip(pet, false));
      });
      locked.forEach((pet) => {
        petsRow.appendChild(createPetChip(pet, true));
      });
      card.appendChild(petsRow);
    }
    container.appendChild(card);
  });
  // After rendering, check for milestone achievements and celebrate
  const totalsArray = scoreboardData.groups.map((grp) => ({ groupId: grp.id, points: totals[grp.id] || 0 }));
  checkMilestonesAndCelebrate(totalsArray);
}

// Render the student leaderboard
function renderStudentLeaderboard() {
  const list = document.getElementById('studentsList');
  const searchInput = document.getElementById('studentSearch');
  const groupFilter = document.getElementById('groupFilter');
  list.innerHTML = '';
  const totals = computeStudentTotals();
  // Build array with computed points
  let students = scoreboardData.students.map((s) => {
    return Object.assign({}, s, { points: totals[s.id] || 0 });
  });
  // Filter by group if selected
  if (groupFilter.value && groupFilter.value !== 'all') {
    students = students.filter((s) => s.groupId === groupFilter.value);
  }
  // Filter by class/hour if selected
  const classFilter = document.getElementById('classFilter');
  if (classFilter && classFilter.value && classFilter.value !== 'all') {
    students = students.filter((s) => (s.classId || 'all') === classFilter.value);
  }
  // Filter by search string
  const q = searchInput.value.trim().toLowerCase();
  if (q) {
    students = students.filter((s) => s.name.toLowerCase().includes(q));
  }
  // Sort by points desc
  students.sort((a, b) => b.points - a.points);
  if (students.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'no-data';
    msg.textContent = 'No students found.';
    list.appendChild(msg);
    return;
  }
  students.forEach((s, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    const group = scoreboardData.groups.find((g) => g.id === s.groupId);
    // Build powerup badges
    let powerupsHtml = '';
    if (s.powerups && s.powerups.length > 0) {
      s.powerups.forEach((pid) => {
        const p = scoreboardData.powerups.find((x) => x.id === pid);
        if (p) {
          powerupsHtml += `<span class="badge" style="background-color: #6b7280;">${p.label}</span>`;
        }
      });
    } else {
      powerupsHtml = '<span class="small">No powerups</span>';
    }
    card.innerHTML = `
      <h3>${s.name} <span class="chip" style="background-color:${group.color}">${group.name}</span></h3>
      <p><strong>${s.points}</strong> points • Level ${s.level}</p>
      <div class="powerups">${powerupsHtml}</div>
      <p class="small">Rank #${index + 1}</p>
    `;
    list.appendChild(card);
  });
}

// Set up the profile lookup functionality
function setupProfileLookup() {
  const codeInput = document.getElementById('codeInput');
  const profileArea = document.getElementById('profileArea');
  const profileInfo = document.getElementById('profileInfo');
  const profileTx = document.getElementById('profileTransactions');
  const noStudentMsg = document.getElementById('noStudent');

  // Save last used code so returning user sees their data automatically
  const saved = window.localStorage.getItem('student_code');
  if (saved) {
    codeInput.value = saved;
  }
  function lookup() {
    const code = codeInput.value.trim().toLowerCase();
    if (!code) {
      profileArea.style.display = 'none';
      noStudentMsg.style.display = 'block';
      return;
    }
    const student = scoreboardData.students.find((s) => s.code.toLowerCase() === code);
    if (!student) {
      profileArea.style.display = 'none';
      noStudentMsg.style.display = 'block';
      noStudentMsg.textContent = 'No student found for that code.';
      return;
    }
    // Persist code for convenience
    window.localStorage.setItem('student_code', student.code);
    noStudentMsg.style.display = 'none';
    profileArea.style.display = 'block';
    // Compute student's total points
    const totals = computeStudentTotals();
    const total = totals[student.id] || 0;
    // Build profile info
    const group = scoreboardData.groups.find((g) => g.id === student.groupId);
    let powerupsHtml = '';
    if (student.powerups && student.powerups.length > 0) {
      student.powerups.forEach((pid) => {
        const p = scoreboardData.powerups.find((x) => x.id === pid);
        if (p) {
          powerupsHtml += `<span class="badge" style="background-color: #6b7280;">${p.label}</span>`;
        }
      });
    } else {
      powerupsHtml = '<span class="small">No powerups</span>';
    }
    profileInfo.innerHTML = `
      <h3>${student.name} <span class="chip" style="background-color:${group.color}">${group.name}</span></h3>
      <p><strong>${total}</strong> points • Level ${student.level}</p>
      <div class="powerups">${powerupsHtml}</div>
      <p class="small">Student Code: <span style="font-family: monospace;">${student.code}</span></p>
    `;
    // Build transaction list
    const txList = scoreboardData.transactions
      .filter((t) => t.studentId === student.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    profileTx.innerHTML = '';
    if (txList.length === 0) {
      const row = document.createElement('div');
      row.className = 'no-data';
      row.textContent = 'No recent activity.';
      profileTx.appendChild(row);
    } else {
      txList.forEach((t) => {
        const row = document.createElement('div');
        row.className = 'card';
        row.style.padding = '0.5rem';
        row.style.marginBottom = '0.5rem';
        const deltaColor = t.delta >= 0 ? '#059669' : '#dc2626';
        const sign = t.delta >= 0 ? '+' : '';
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p style="margin:0; font-weight:600; font-size:0.875rem;">${t.reason}</p>
              <p class="small">${t.date}</p>
            </div>
            <div style="color:${deltaColor}; font-weight:600; font-size:0.875rem;">${sign}${t.delta}</div>
          </div>
        `;
        profileTx.appendChild(row);
      });
    }
  }
  // Trigger lookup when input changes or on enter key
  codeInput.addEventListener('input', lookup);
  codeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      lookup();
    }
  });
  // If code pre-filled then show immediately
  if (codeInput.value) {
    lookup();
  } else {
    profileArea.style.display = 'none';
    noStudentMsg.style.display = 'block';
  }
}

// Setup tab switching for navigation
function setupTabSwitching() {
  const buttons = document.querySelectorAll('.tab-buttons button');
  const sections = document.querySelectorAll('.section');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Activate button
      buttons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Show corresponding section
      const target = btn.getAttribute('data-target');
      sections.forEach((sec) => {
        if (sec.id === target) {
          sec.classList.add('active');
        } else {
          sec.classList.remove('active');
        }
      });
    });
  });
  // Default open first tab
  if (buttons.length > 0) {
    buttons[0].click();
  }
}

// Populate the group filter dropdown and attach event handlers. This is
// called once after scoreboardData has been parsed. It also attaches
// listeners to refresh the student leaderboard when the search or filter
// inputs change.
function populateGroupFilter() {
  const filter = document.getElementById('groupFilter');
  // Clear any existing options except the first (All groups)
  while (filter.options.length > 1) {
    filter.remove(1);
  }
  scoreboardData.groups.forEach((g) => {
    const option = document.createElement('option');
    option.value = g.id;
    option.textContent = g.name;
    filter.appendChild(option);
  });
  filter.addEventListener('change', renderStudentLeaderboard);
  const searchInput = document.getElementById('studentSearch');
  searchInput.addEventListener('input', renderStudentLeaderboard);
}

// Populate the class/hour filter dropdown based on student data. Each unique
// `classId` found on students will become an option. If no element with
// id="classFilter" exists in the DOM, this function does nothing.
function populateClassFilter() {
  const filter = document.getElementById('classFilter');
  if (!filter) return;
  // Remove existing options except the first (All hours)
  while (filter.options.length > 1) {
    filter.remove(1);
  }
  const seen = new Set();
  // Collect classIds from students
  scoreboardData.students.forEach((s) => {
    if (s.classId) {
      seen.add(s.classId);
    }
  });
  // Sort the identifiers for stability
  const ids = Array.from(seen).sort();
  ids.forEach((cid) => {
    const option = document.createElement('option');
    option.value = cid;
    // Format display: convert "hour1" -> "Hour 1" etc.
    const label = cid.replace(/^hour/i, 'Hour ');
    option.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    filter.appendChild(option);
  });
  filter.addEventListener('change', renderStudentLeaderboard);
}

// Launch a confetti animation using a full-screen canvas. Inspired by
// various lightweight confetti scripts; draws simple squares that fall and
// spin across the screen. Called when milestones are reached.
function launchConfetti(durationMs = 1200, count = 220) {
  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  // Resize the canvas to fill the viewport
  function resize() {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize, { once: true });
  // Generate confetti particles
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * 100,
    r: 3 + Math.random() * 4,
    c: `hsl(${Math.random() * 360},90%,60%)`,
    vx: -1 + Math.random() * 2,
    vy: 2 + Math.random() * 3,
    rot: Math.random() * Math.PI,
    vr: -0.2 + Math.random() * 0.4,
  }));
  const t0 = performance.now();
  function frame(t) {
    const elapsed = t - t0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx * dpr;
      p.y += p.vy * dpr;
      p.rot += p.vr;
      // Wrap around horizontally
      if (p.x > canvas.width) p.x = 0;
      if (p.x < 0) p.x = canvas.width;
      // Draw square confetti
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
    }
    if (elapsed < durationMs) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(frame);
}

// Celebrate milestones when group totals exceed multiples of 25 points. It
// compares the current totals to previously saved totals in localStorage
// and triggers a confetti burst if any group crosses a new threshold.
function checkMilestonesAndCelebrate(groupTotals) {
  const storageKey = 'lmh_group_points';
  let prevTotals = {};
  try {
    prevTotals = JSON.parse(localStorage.getItem(storageKey) || '{}');
  } catch (e) {
    prevTotals = {};
  }
  let crossed = false;
  groupTotals.forEach((entry) => {
    const before = prevTotals[entry.groupId] || 0;
    const after = entry.points || 0;
    // Determine thresholds crossed: multiples of 25
    if (Math.floor(before / 25) < Math.floor(after / 25) && after >= 25) {
      crossed = true;
    }
  });
  // Persist current totals for next check
  const toSave = {};
  groupTotals.forEach((entry) => {
    toSave[entry.groupId] = entry.points || 0;
  });
  try {
    localStorage.setItem(storageKey, JSON.stringify(toSave));
  } catch (e) {
    /* ignore localStorage issues */
  }
  if (crossed) {
    launchConfetti();
  }
}