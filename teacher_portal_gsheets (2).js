/*
 * Teacher portal integration for the Luchador scoreboard with Google Sheets sync.
 *
 * This script adds a teacher-only tab to your scoreboard. The portal
 * requires a passcode defined in your data JSON (teacherPasscode), and
 * allows teachers to add or remove points for any student via a simple form.
 *
 * When a transaction is submitted, the script sends a POST request to
 * your Google Apps Script Web App (GSCRIPT_URL) which appends the
 * transaction to a Google Sheet. It also updates the local scoreboard
 * data so changes appear immediately on the page.
 *
 * The script can also fetch all existing transactions from the Sheet on
 * page load, replacing the local transactions array. Use this to keep
 * your site in sync with the Sheet.
 *
 * IMPORTANT: Replace GSCRIPT_URL with the deployment URL of your
 * Google Apps Script. Ensure that your Apps Script web app is deployed
 * with access permissions appropriate for your use (e.g. "Anyone with
 * the link" or your domain).
 */

(function() {
  // Replace with your actual Apps Script web app URL. It should end with /exec.
  const GSCRIPT_URL = 'YOUR_GSCRIPT_URL_HERE';

  /**
   * Initialize the teacher portal: hook up the Teacher tab, unlock form,
   * and build the selectors for hour, group and student.
   */
  function initTeacherPortal() {
    // Only proceed if the necessary elements exist in the DOM.
    const teacherTab = document.getElementById('tab-teacher');
    const teacherSection = document.getElementById('teacher');
    if (!teacherTab || !teacherSection) {
      return;
    }
    // Hook tab click to show the teacher section.
    teacherTab.addEventListener('click', function(e) {
      e.preventDefault();
      // hide other sections
      const secs = document.querySelectorAll('section.section');
      secs.forEach(sec => sec.style.display = 'none');
      teacherSection.style.display = '';
    });

    // Unlock button
    const unlockBtn = document.getElementById('teacherUnlockBtn');
    if (unlockBtn) {
      unlockBtn.addEventListener('click', tryUnlockTeacher);
    }
    // Add transaction button
    const addBtn = document.getElementById('tpAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', addTeacherTransaction);
    }
    // Export button
    const exportBtn = document.getElementById('tpExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportDataJson);
    }
    // Set default date to today
    const dateInput = document.getElementById('tpDate');
    if (dateInput) {
      const today = new Date();
      dateInput.value = today.toISOString().slice(0, 10);
    }
  }

  /**
   * Attempt to unlock the teacher portal using the provided passcode.
   */
  function tryUnlockTeacher() {
    const passInput = document.getElementById('teacherPass');
    const msgEl = document.getElementById('teacherMsg');
    const lockedDiv = document.getElementById('teacher-locked');
    const bodyDiv = document.getElementById('teacher-body');
    if (!passInput || !msgEl || !lockedDiv || !bodyDiv) return;
    const entered = passInput.value.trim();
    const expected = (window.scoreboardData && window.scoreboardData.teacherPasscode) || '';
    if (!expected) {
      msgEl.textContent = 'Teacher passcode is not set in the data.';
      return;
    }
    if (entered === expected) {
      // Correct passcode
      lockedDiv.style.display = 'none';
      bodyDiv.style.display = '';
      populateTeacherSelectors();
      msgEl.textContent = '';
    } else {
      msgEl.textContent = 'Incorrect passcode. Please try again.';
    }
  }

  /**
   * Populate hour, group, and student selectors based on the loaded data.
   */
  function populateTeacherSelectors() {
    const hourSelect = document.getElementById('tpHour');
    const groupSelect = document.getElementById('tpGroup');
    const studentSelect = document.getElementById('tpStudent');
    if (!hourSelect || !groupSelect || !studentSelect) return;
    // Clear any existing options
    hourSelect.innerHTML = '';
    groupSelect.innerHTML = '';
    studentSelect.innerHTML = '';
    // Get unique hours from the groups array
    const groups = (window.scoreboardData && window.scoreboardData.groups) || [];
    const hours = Array.from(new Set(groups.map(g => g.hour)));
    // Sort hours for display
    hours.sort();
    hours.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = labelForHour(h);
      hourSelect.appendChild(opt);
    });
    // Populate group and student selects when hour changes
    hourSelect.addEventListener('change', () => {
      fillGroupsForHour(hourSelect.value);
      fillStudentsForGroup(groupSelect.value);
    });
    groupSelect.addEventListener('change', () => {
      fillStudentsForGroup(groupSelect.value);
    });
    // Initialize selects with first hour
    if (hours.length > 0) {
      hourSelect.value = hours[0];
      fillGroupsForHour(hours[0]);
      fillStudentsForGroup(groupSelect.value);
    }
  }

  /**
   * Convert hour keys to friendly labels.
   * Customize this mapping if your hour names change.
   *
   * @param {string} h
   * @returns {string}
   */
  function labelForHour(h) {
    const map = {
      hour3: '3rd hour',
      hour4: '4th hour',
      zion: 'Zion Lutheran',
      hs5_ms6: 'HS 5th/MS 6th'
    };
    return map[h] || h;
  }

  /**
   * Fill the group select with groups from the selected hour.
   *
   * @param {string} hour
   */
  function fillGroupsForHour(hour) {
    const groupSelect = document.getElementById('tpGroup');
    if (!groupSelect) return;
    groupSelect.innerHTML = '';
    const groups = (window.scoreboardData && window.scoreboardData.groups) || [];
    groups
      .filter(g => g.hour === hour)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        groupSelect.appendChild(opt);
      });
    if (groupSelect.options.length > 0) {
      groupSelect.value = groupSelect.options[0].value;
    }
  }

  /**
   * Fill the student select with students from the selected group.
   *
   * @param {string} groupId
   */
  function fillStudentsForGroup(groupId) {
    const studentSelect = document.getElementById('tpStudent');
    if (!studentSelect) return;
    studentSelect.innerHTML = '';
    const students = (window.scoreboardData && window.scoreboardData.students) || [];
    students
      .filter(s => s.groupId === groupId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        studentSelect.appendChild(opt);
      });
    if (studentSelect.options.length > 0) {
      studentSelect.value = studentSelect.options[0].value;
    }
  }

  /**
   * Add a transaction via the teacher portal and send it to Google Sheets.
   */
  function addTeacherTransaction() {
    const hourSel = document.getElementById('tpHour');
    const groupSel = document.getElementById('tpGroup');
    const studentSel = document.getElementById('tpStudent');
    const deltaInput = document.getElementById('tpDelta');
    const reasonInput = document.getElementById('tpReason');
    const dateInput = document.getElementById('tpDate');
    const msgEl = document.getElementById('tpAddMsg');
    if (!hourSel || !groupSel || !studentSel || !deltaInput || !msgEl) return;
    const groupId = groupSel.value;
    const studentId = studentSel.value;
    const delta = parseFloat(deltaInput.value || '0');
    const reason = reasonInput.value.trim() || 'Adjustment';
    const date = dateInput.value;
    if (!groupId || !studentId || isNaN(delta) || delta === 0) {
      msgEl.textContent = 'Please select a student and enter a non-zero points value.';
      return;
    }
    // Build payload for Google Sheets
    const payload = {
      studentId: studentId,
      groupId: groupId,
      delta: delta,
      reason: reason,
      date: date || undefined
    };
    // Post to Apps Script
    postTransactionToSheet(payload)
      .then(newId => {
        msgEl.textContent = `Added ${delta > 0 ? '+' : ''}${delta} points for ` + studentSel.options[studentSel.selectedIndex].textContent + '.';
        // Also update local scoreboardData so the leaderboard updates immediately
        if (!Array.isArray(window.scoreboardData.transactions)) {
          window.scoreboardData.transactions = [];
        }
        window.scoreboardData.transactions.push({
          id: newId,
          studentId: studentId,
          groupId: groupId,
          delta: delta,
          reason: reason,
          date: date || new Date().toISOString().slice(0, 10)
        });
        // Refresh leaderboards
        if (typeof renderGroupLeaderboard === 'function') renderGroupLeaderboard();
        if (typeof renderStudentLeaderboard === 'function') renderStudentLeaderboard();
      })
      .catch(err => {
        console.error(err);
        msgEl.textContent = 'Error adding transaction: ' + err.message;
      });
  }

  /**
   * Send a POST request to the Apps Script to add a transaction.
   *
   * @param {Object} payload
   * @returns {Promise<string>} Resolves with the new transaction id
   */
  async function postTransactionToSheet(payload) {
    if (!GSCRIPT_URL || GSCRIPT_URL === 'YOUR_GSCRIPT_URL_HERE') {
      throw new Error('GSCRIPT_URL is not set. Please update teacher_portal_gsheets.js with your Apps Script URL.');
    }
    const res = await fetch(GSCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error('Network error: ' + res.status);
    }
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error || 'Unknown error');
    }
    return json.id;
  }

  /**
   * Export the current scoreboard data as JSON for backup purposes.
   */
  function exportDataJson() {
    const blob = new Blob([JSON.stringify(window.scoreboardData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scoreboard-data.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  /**
   * Fetch the latest transactions from the Google Sheet and replace local transactions.
   */
  function loadLatestTransactions() {
    if (!GSCRIPT_URL || GSCRIPT_URL === 'YOUR_GSCRIPT_URL_HERE') {
      // Don't attempt to fetch if URL is not configured
      return;
    }
    fetch(GSCRIPT_URL)
      .then(res => res.json())
      .then(data => {
        if (data.ok && Array.isArray(data.transactions)) {
          window.scoreboardData.transactions = data.transactions;
          // Re-render leaderboards
          if (typeof renderGroupLeaderboard === 'function') renderGroupLeaderboard();
          if (typeof renderStudentLeaderboard === 'function') renderStudentLeaderboard();
        }
      })
      .catch(err => {
        console.error('Failed to fetch latest transactions:', err);
      });
  }

  // Initialize after DOM content is loaded
  document.addEventListener('DOMContentLoaded', () => {
    initTeacherPortal();
    // Load latest transactions from sheet on start
    loadLatestTransactions();
  });
})();