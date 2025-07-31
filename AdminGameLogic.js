// 🔥 Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCArsZCLerFM_JA79r4xiq153ENGc1S7JE",
  authDomain: "kattappa-mama.firebaseapp.com",
  projectId: "kattappa-mama",
  storageBucket: "kattappa-mama.firebasestorage.app",
  messagingSenderId: "725489768693",
  appId: "1:725489768693:web:d6f0dec4a2d17ebf558dbc",
  measurementId: "G-6HDYWBCRNQ"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let room = null;
let questionNumber = 1;

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM Ready: AdminGameLogic.js loaded");

  const hostLoginBtn = document.getElementById("submit");
  if (!hostLoginBtn) {
    console.error("❌ hostLoginBtn not found in HTML");
    return;
  }

  hostLoginBtn.addEventListener("click", async () => {
    console.log("✅ Login button clicked");

    const enteredID = document.getElementById("hostID").value.trim();
    const enteredPass = document.getElementById("hostPass").value.trim();

    if (!enteredID || !enteredPass) {
      alert("⚠️ Please enter both Host ID and Password");
      return;
    }

    try {
      const hostsRef = db.collection("Hosts");
      const snapshot = await hostsRef.get();
      console.log("✅ Hosts fetched:", snapshot.size);

      let loginSuccess = false;

      snapshot.forEach(doc => {
        const data = doc.data();
        console.log("🔍 Checking host:", data.hostID);
        if (data.hostID === enteredID && data.password === enteredPass) {
          loginSuccess = true;
          room = data.assignedRoom;
        }
      });

      if (!loginSuccess) {
        console.error("❌ Invalid credentials");
        alert("❌ Invalid Host ID or Password");
        return;
      }

      console.log(`✅ Login success! Assigned room: ${room}`);
      sessionStorage.setItem("hostRoom", room);
      document.getElementById("host-room-display").textContent = `Room: ${room}`;

      // Show panel after successful login
      document.getElementById("Login-page").style.display = "none";
      document.getElementById("host-panel").style.display = "block";

      // Update room display
      document.getElementById("host-room-display").textContent = `${room}`;

      // Initialize quiz controls and load teams
      initAdminControls();
      loadTeamsAndDisplay();
      
      // ✅ Sync question number with Firestore if already present
      db.collection("Tech-Orbit").doc(room).get().then((doc) => {
        if (doc.exists && doc.data().currentQuestion?.questionNumber) {
          questionNumber = doc.data().currentQuestion.questionNumber + 1;
          console.log(`🔄 Synced starting question number: ${questionNumber}`);
        } else {
          questionNumber = 1;
          console.log("🔄 No existing question found, starting from 1");
        }
      });

      // Initialize quiz controls and load teams
      listenForCurrentQuestionAdmin();

    } catch (error) {
      console.error("🔥 Host login error:", error);
      alert("⚠️ Something went wrong during login.");
    }
  });
});

function listenForCurrentQuestionAdmin() {
  db.collection("Tech-Orbit").doc(room).onSnapshot((doc) => {
    if (!doc.exists) return;
    const data = doc.data();
    const qNum = data?.currentQuestion?.questionNumber;

    if (qNum !== undefined) {
      document.getElementById("admin-question-display").textContent =
        `Current Question: ${qNum}`;
    } else {
      document.getElementById("admin-question-display").textContent =
        `Current Question: 1`;
    }
  });
}

// Initialize all quiz control buttons AFTER login
function initAdminControls() {
  const nextQuestionBtn = document.getElementById("next-question-btn");
  const endGameBtn = document.getElementById("end-game-btn");
  const status = document.getElementById("status-msg");
  const resetBtn = document.getElementById("reset-quiz-btn");
  const toggleBtn = document.getElementById("toggle-offline-btn");
  const startTimerBtn = document.getElementById("start-timer-btn");

  startTimerBtn.addEventListener("click", () => {
    db.collection("Tech-Orbit").doc(room).update({
      "currentQuestion.timerActive": true,
      "currentQuestion.timerStart": firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      console.log("✅ Timer started for users");
    }).catch(err => console.error("❌ Timer start failed:", err));
  });


  let showOfflineTeams = false;

  toggleBtn.addEventListener("click", () => {
    showOfflineTeams = !showOfflineTeams;
    toggleBtn.textContent = showOfflineTeams ? "Hide Offline Teams" : "Show Offline Teams";
    loadTeamsAndDisplay(showOfflineTeams);
  });

  nextQuestionBtn.addEventListener("click", () => {
    db.collection("Tech-Orbit").doc(room).update({
      "currentQuestion.active": true,
      "currentQuestion.questionNumber": questionNumber,
      "currentQuestion.timerActive": false,
      "currentQuestion.timerStart": firebase.firestore.FieldValue.delete()
    }).then(() => {
      status.textContent = `➡️ Next Question ${questionNumber} is ready. Click Start Timer to begin countdown.`;
      questionNumber++;
      loadTeamsAndDisplay();
    }).catch((err) => {
    console.error("❌ Error starting next question:", err);
  });
});


  resetBtn.addEventListener("click", async () => {
  if (!confirm("⚠️ Are you sure you want to reset the quiz? This will clear all scores!")) return;

  try {
    console.log("🔄 Resetting quiz for room:", room);

    // Reset the room status
    await db.collection("Tech-Orbit").doc(room).update({
      quizEnded: false,
      winner: firebase.firestore.FieldValue.delete(),
      currentQuestion: {
        questionNumber: 1,
        active: false,
        timeractive: false
      }
    });

    // Reset all teams (set points to 10, clear bets & last results)
    questionNumber = 1;
    console.log("✅ Question number reset to 1");

    const teamsRef = db.collection("Tech-Orbit").doc(room).collection("Teams");
    const snapshot = await teamsRef.get();

    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, {
        points: 100,
        
        currentBet: firebase.firestore.FieldValue.delete(),
        lastResult: firebase.firestore.FieldValue.delete()
      });
    });

    await batch.commit();
    alert("✅ Quiz has been reset successfully!");
    loadTeamsAndDisplay();

  } catch (error) {
    console.error("❌ Error resetting quiz:", error);
    alert("❌ Failed to reset quiz. Check console.");
  }
});


  // End Game
  endGameBtn.addEventListener("click", async () => {
    const teamsRef = db.collection("Tech-Orbit").doc(room).collection("Teams");
    const snapshot = await teamsRef.get();

    let winner = null;
    let highestPoints = -1;

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.points > highestPoints) {
        highestPoints = data.points;
        winner = doc.id;
      }
    });

    db.collection("Tech-Orbit").doc(room).update({
      quizEnded: true,
      winner: winner
    }).then(() => {
      status.textContent = `🏁 Quiz Ended! Winner: ${winner}`;
      console.log("✅ Quiz ended. Winner:", winner);
      loadFinalAdminScoreboard();

      // Hide the teams in room section
      const teamsSection = document.getElementById("team-answers");
      if (teamsSection) {
        teamsSection.style.display = "none";
      }
    }).catch(err => console.error(err));
  });
}

// Load all teams for the assigned room
function loadTeamsAndDisplay(showOffline = false) {
  const container = document.getElementById("teams-container");
  container.innerHTML = "";

  db.collection("Tech-Orbit").doc(room).collection("Teams")
    .get()
    .then(async snapshot => {
      // Get current question number from room document
      const roomDoc = await db.collection("Tech-Orbit").doc(room).get();
      const currentQuestionNumber = roomDoc.exists && roomDoc.data().currentQuestion?.questionNumber;

      snapshot.forEach(doc => {
        const teamData = doc.data();

        // Check user online or not
        const lastSeen = teamData.lastSeen ? teamData.lastSeen.toDate() : null;
        const isActive = lastSeen && (Date.now() - lastSeen.getTime()) < 5000; // 

        if (!showOffline && !isActive) return; // hide offline teams unless toggled

        const div = document.createElement("div");
        div.classList.add("team-card");
        if (isActive) {
          div.classList.add("online");
        } else {
          div.classList.add("offline");
        }

        // Disable buttons if team already marked for current question
        const alreadyMarked = teamData.lastResultQuestion === currentQuestionNumber;

        div.innerHTML = `
          <div class="team-header">
            <strong class="team-name">${teamData.teamName || doc.id}</strong>
            <div class="team-status">
              <span class="status-led ${isActive ? 'led-online' : 'led-offline'}"></span>
              <span class="status-text">${isActive ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          <div class="team-info">
            <div class="team-points">Points: ${teamData.points || 0}</div>
            <div class="action-buttons">
              <button class="btn-correct" onclick="markAnswer('${doc.id}', true)" ${alreadyMarked ? 'disabled' : ''}>✅ Correct</button>
              <button class="btn-wrong" onclick="markAnswer('${doc.id}', false)" ${alreadyMarked ? 'disabled' : ''}>❌ Wrong</button>
            </div>
          </div>
        `;


        container.appendChild(div);
      });
    });
}

// Approve (or) reject team answer and update points
window.markAnswer = async function(teamName, isCorrect) {
  if (!room) return;

  const teamRef = db.collection("Tech-Orbit").doc(room).collection("Teams").doc(teamName);
  const teamDoc = await teamRef.get();
  const data = teamDoc.data();
  const bet = data.currentBet || 10;
  const points = data.points || 0;

  const newPoints = isCorrect ? points + bet : points - bet;

  // Get current question number from room document
  const roomDoc = await db.collection("Tech-Orbit").doc(room).get();
  const currentQuestionNumber = roomDoc.exists && roomDoc.data().currentQuestion?.questionNumber;

  teamRef.update({
    points: newPoints,
    lastResult: isCorrect ? "correct" : "wrong",
    lastResultQuestion: currentQuestionNumber || null,
    betLocked: false,
    currentBet: firebase.firestore.FieldValue.delete()
  }).then(() => {
    console.log(`${teamName} marked as ${isCorrect ? "✅ correct" : "❌ wrong"}`);
    loadTeamsAndDisplay();
  }).catch(err => console.error("❌ Update error:", err));
};

// Show final scores after the game ends
function loadFinalAdminScoreboard() {
  const container = document.getElementById("admin-scoreboard-container");
  container.innerHTML = "";

  if (!room) return;

  db.collection("Tech-Orbit").doc(room).collection("Teams")
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const data = doc.data();
        const div = document.createElement("div");
        div.style.margin = "5px";
        div.style.padding = "5px";
        div.style.borderBottom = "1px solid rgba(255,255,255,0.3)";
        const teamName = data.teamName || doc.id;
        div.innerHTML = `<strong>${teamName}</strong>: ${data.points} pts`;
        container.appendChild(div);
      });
    });

  document.getElementById("final-admin-scoreboard").style.display = "block";
}
