# 🐦 Flappy Bird — Classic Game + Deep Q-Network Research

This repository has two parts that share one game but run independently:

1. **A classic, human-playable Flappy Bird** — vanilla HTML5 Canvas + JavaScript, no server-side game logic, no AI. This is what's deployed live.
2. **A Deep Q-Network (DQN) research project** — a from-scratch PyTorch agent that learns to play Flappy Bird via reinforcement learning (`agent.py`, `dqn.py`), plus **Q-Learning** and **SARSA** notebooks on the Cliff Walking environment. This runs locally/offline; it is not part of the deployed web app.

---
<a href="https://flappybird-8udg.onrender.com">
  <img src="https://img.shields.io/badge/Play-Game-2EA043?style=flat-square" height="40">
<img src="https://img.shields.io/badge/python-3.12-3776AB?style=flat-square" height="40">
<img src="https://img.shields.io/badge/pygame-2.5-F5D415?style=flat-square" height="40">
<img src="https://img.shields.io/badge/license-MIT-7C3AED?style=flat-square" height="40">

## 🎮 Play It

Press **Space** or **⬆ Arrow** to flap. Click or tap works too. Score goes up by exactly 1 each time you clear a pair of pipes. Hit a pipe or the ground and it's Game Over — press the flap key again to start a new run.

**Live:** _add your Render URL here after deploying (see "Deploying to Render" below)_

Run it locally without installing anything but a browser:

```bash
cd static
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000`.

---

## 📌 Project Overview

The playable game (`static/index.html`, `style.css`, `script.js`) is a self-contained implementation of classic Flappy Bird:

- Fixed-timestep physics (gravity + a flap impulse), so the game runs at the same speed regardless of screen refresh rate.
- Procedural pipes: gap position is randomized within a range, and consecutive gaps are never further apart vertically than a human can realistically reach in time.
- Precise collision detection against the pipes' actual drawn shapes (body + cap), not a rough bounding box.
- A best-score high score, kept in the browser via `localStorage`.
- Crisp rendering on high-DPI phone and laptop screens (the canvas is backed by real device pixels, not just CSS-scaled).

None of this needs a backend — `app.py` only exists to serve the three static files (and a `/health` endpoint for Render), which is what keeps this deployable as a lightweight Render web service.

The **separate** DQN research project (below) explores the same game from a different angle: instead of a human pressing a key, a neural network observes 180 simulated LIDAR readings plus the bird's own state, and learns — through trial, error, and reward — when to flap.

---

## 🧠 Reinforcement Learning Approach (research code, run locally)

### Deep Q-Network (DQN)

A neural network approximates the Q-function:

- Input layer: environment state features (180 LIDAR readings + bird state)
- Hidden layer: 256 neurons
- Activation: ReLU
- Output layer: 2 action values

The two output values correspond to the available Flappy Bird actions. Implemented in PyTorch.

### Experience Replay

A replay-memory buffer (Python's `deque`) stores experiences as:

```text
(state, action, next_state, reward, termination)
```

Random mini-batches are sampled from the buffer during training, so the agent learns from a mix of past experience rather than only the most recent transition.

### Target Network

A separate target DQN is maintained during training and periodically synchronized with the policy DQN, which provides more stable target Q-value calculations.

### Double DQN

The policy network picks the best next action; the target network judges how good that action actually is. Using a single network for both jobs (plain DQN) systematically overestimates Q-values — decoupling the two is a standard, low-cost fix.

### Per-Step Learning

The network learns from a mini-batch after every environment step once there's enough replay experience, rather than once per full episode. Early episodes end in only a handful of steps, so once-per-episode updates meant very little gradient signal for a long time — this converges dramatically faster in wall-clock time.

### Gradient Clipping

Occasional large penalties (a crash, a near-miss) can otherwise produce oversized gradients that destabilize training. Gradients are clipped to a max norm before each optimizer step.

### Resumable Training

Training can be safely stopped and restarted: the policy weights, exploration rate (epsilon), and best rolling-average reward are all persisted to `runs/` and picked back up automatically the next time `--train` runs, instead of starting over from random weights.

### Checkpoint Selection

Checkpoints are saved based on a rolling average over the last 50 episodes, not a single episode's reward — one lucky run (an easy pipe layout, a lucky random action) can otherwise beat the record without the policy actually having improved.

### Epsilon-Greedy Exploration

Epsilon starts high (frequent random exploration) and decays toward a configured minimum, gradually shifting the agent from exploration toward exploiting what it's learned.

---

## 🎮 Original AI Screenshot

For reference, this is what the DQN agent's own `render_mode="human"` window looks like locally (via `agent.py`), LIDAR rays included — this view isn't part of the deployed web game:

![Flappy Bird DQN](flappy-bird-dqn.png)

---

## 📂 Project Structure

```text
Flappy Bird game/
│
├── static/                    the deployed game (HTML/CSS/JS only)
│   ├── index.html
│   ├── style.css
│   └── script.js
├── app.py                     FastAPI static-file server for static/ (+ /health)
├── requirements.txt           deps for app.py only (fastapi, uvicorn)
├── render.yaml                Render Blueprint for the web game
│
├── agent.py                   DQN training/testing loop (research code)
├── dqn.py                     PyTorch network used as the DQN
├── experience_replay.py       experience replay memory
├── game_flappy_bird.py        manual Pygame test of the RL environment
├── parameters.yaml            training hyperparameters
├── requirements-training.txt  deps for agent.py only (torch, gymnasium, ...)
├── model/flappybirdv0.pt      a trained checkpoint (for local use with agent.py)
│
├── README.md
├── .gitignore
├── flappy-bird-dqn.png
├── Q-Learning_Cliff-walking.ipynb
└── SARSA_Cliff-walking.ipynb
```

### Main Files

| File | Description |
|---|---|
| `static/index.html` | The game's page — canvas + title + footer, no build step |
| `static/style.css` | Page styling |
| `static/script.js` | The entire game: physics, pipes, collisions, scoring, input, rendering |
| `app.py` | Minimal FastAPI app that serves `static/` and a `/health` check |
| `requirements.txt` | What Render installs to run the deployed game |
| `render.yaml` | Render Blueprint — one-click deploy config |
| `agent.py` | DQN agent: training/testing loop, action selection, optimization, checkpointing |
| `dqn.py` | PyTorch neural network used as the DQN |
| `experience_replay.py` | Experience replay memory implementation |
| `game_flappy_bird.py` | Manual Flappy Bird environment test via Pygame |
| `parameters.yaml` | Training hyperparameters |
| `requirements-training.txt` | Dependencies to run `agent.py` locally (not needed to run the game) |
| `model/flappybirdv0.pt` | A trained checkpoint `agent.py` can load and test |
| `Q-Learning_Cliff-walking.ipynb` | Q-Learning implementation for Cliff Walking |
| `SARSA_Cliff-walking.ipynb` | SARSA implementation for Cliff Walking |
| `.gitignore` | Keeps venvs, caches, and generated training files out of Git |
| `flappy-bird-dqn.png` | The original AI screenshot |

---

## ⚙️ Current Hyperparameters (DQN research code)

The `flappybirdv0` configuration currently uses:

| Parameter | Value |
|---|---:|
| Environment | `FlappyBird-v0` |
| Initial Epsilon | `1.0` |
| Minimum Epsilon | `0.05` |
| Epsilon Decay | `0.9995` |
| Replay Memory Size | `100000` |
| Mini-batch Size | `32` |
| Network Sync Rate | `1000` |
| Learning Rate (`alpha`) | `0.001` |
| Discount Factor (`gamma`) | `0.99` |
| Reward Threshold | `1000` |

These values are stored in `parameters.yaml`.

---

## 🛠️ Technologies Used

**Deployed game:** HTML5 Canvas, vanilla JavaScript (no frameworks), FastAPI (just to serve static files on Render).

**DQN research code:** Python, PyTorch, Gymnasium, Flappy Bird Gymnasium, Pygame, PyYAML, NumPy, Jupyter Notebook.

---

## 🚀 Installation

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd "Flappy Bird game"
```

### 2. To run the game

No install needed beyond a browser — see [Play It](#-play-it) above. If you'd rather run it through the FastAPI app exactly as Render does:

```bash
python -m venv venv
.\venv\Scripts\Activate.ps1      # Windows PowerShell
pip install -r requirements.txt
uvicorn app:app --reload
```

### 3. To run the DQN research code

```bash
python -m venv venv-training
.\venv-training\Scripts\Activate.ps1
pip install -r requirements-training.txt
```

---

## ▶️ Running the DQN Research Code

### Train the agent

```powershell
python agent.py flappybirdv0 --train
```

### Watch the trained agent play

```powershell
python agent.py flappybirdv0
```

This loads the saved model and renders the environment in its own window (Pygame), independent of the web game.

---

## ☁️ Deploying to Render

This repo includes a `render.yaml` Blueprint, so Render builds and runs the game without any manual configuration:

1. Push this repository to GitHub.
2. On the [Render dashboard](https://dashboard.render.com), choose **New → Blueprint** and point it at the repo.
3. Render reads `render.yaml`, runs `pip install -r requirements.txt` (just FastAPI + Uvicorn — the game itself is plain JavaScript, so this build is quick), and starts the service on the free plan.
4. Once the deploy finishes, the game is at `https://<service-name>.onrender.com`. Paste that link at the top of this README.

Prefer to configure the service by hand instead of using the Blueprint?

| Setting | Value |
|---|---|
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |

On the free plan, the service spins down after 15 minutes without visitors and takes roughly 30–60 seconds to wake back up on the next visit — expected behavior, not a bug.

---

## 📊 Training Output (DQN research code)

During training, the program prints the episode number, total reward, and current epsilon value:

```text
episode=1 with total reward=...
episode=2 with total reward=...
...
```

The log records a **rolling 50-episode average** each time it improves (`best avg reward = ... (single-episode best so far: ...) at episode=...`), since judging by one episode is noisy — an easy pipe layout or a lucky random action can produce a great single episode without the underlying policy having actually improved.

An earlier version of this project (single-episode checkpoint criterion, updates once per episode instead of once per step) reached a best single-episode reward of `19.4` at episode `13445` in a longer run — kept here as a historical reference point; it isn't directly comparable to fresh runs since the algorithm has since changed (see "Reinforcement Learning Approach" above).

---

## 💾 Model and Training Files

Training generates files inside the `runs/` directory:

```text
runs/
├── flappybirdv0.pt      the checkpoint itself
├── flappybirdv0.log     history of rolling-average improvements
├── flappybirdv0.epsilon current exploration rate (for resuming)
└── flappybirdv0.bestavg current best rolling average (for resuming)
```

These are generated training artifacts and are intentionally excluded from Git tracking by `.gitignore`. The committed `model/flappybirdv0.pt` is a separate, deliberately-kept checkpoint for anyone who clones the repo and wants to run `agent.py flappybirdv0` (without `--train`) right away.

---

## 📚 Additional Reinforcement Learning Examples

Two educational notebooks, independent of the Flappy Bird code:

### Q-Learning — Cliff Walking

`Q-Learning_Cliff-walking.ipynb` — the tabular Q-Learning approach.

### SARSA — Cliff Walking

`SARSA_Cliff-walking.ipynb` — the SARSA on-policy learning approach.

These provide a progression from traditional tabular Reinforcement Learning methods to the DQN approach used for Flappy Bird.

---

## 🔄 DQN Training Flow (research code)

```text
             ┌─────────────────────┐
             │  Flappy Bird Env    │
             └──────────┬──────────┘
                        │
                     State
                        │
                        ▼
             ┌─────────────────────┐
             │     Policy DQN      │
             └──────────┬──────────┘
                        │
                 Q-values / Action
                        │
                        ▼
             ┌─────────────────────┐
             │  Environment Step   │
             └──────────┬──────────┘
                        │
              State, Reward, Done
                        │
                        ▼
             ┌─────────────────────┐
             │   Replay Memory     │
             └──────────┬──────────┘
                        │
                  Mini-batch
                        │
                        ▼
             ┌─────────────────────┐
             │   DQN Optimization  │
             └──────────┬──────────┘
                        │
                        ▼
             ┌─────────────────────┐
             │   Target Network    │
             └─────────────────────┘
```

---

## 🎯 Learning Objectives

This project demonstrates:

- Classic game programming: physics, collision detection, game state, input handling
- Reinforcement Learning fundamentals
- Q-Learning concepts
- SARSA
- Deep Q-Networks, incl. Double DQN
- Neural-network-based Q-value approximation
- Epsilon-greedy exploration
- Experience replay
- Target networks
- Reward-based learning
- Model training, checkpointing, and resumable sessions
- Using Gymnasium environments
- PyTorch-based Deep Reinforcement Learning

---

## ⚠️ Notes

- Run commands from the project root directory.
- Keep `parameters.yaml` in the same directory as `agent.py`.
- Do not upload the `venv/` directory.
- Do not upload Python cache files.
- Training logs and generated model files are excluded from Git by default.
- The DQN research code and the deployed game are independent — changes to one don't require changes to the other.

---

## 👨‍💻 Author

**Abhishek Grover**

<div align="center">
  <a href="https://www.linkedin.com/in/abhishek-grover07/"><img src="https://img.shields.io/badge/LinkedIn-2.2K%20Followers-0077B5?logo=linkedin&logoColor=white" alt="LinkedIn" /></a>
  <a href="mailto:ss107456@gmail.com"><img src="https://img.shields.io/badge/Open_to-Opportunities-9333EA?logo=maildotru&logoColor=white" alt="Open to Opportunities" /></a>
    <a href="mailto:ss107456@gmail.com"><img src="https://img.shields.io/badge/Email-ss107456%40gmail.com-EA4335?logo=gmail&logoColor=white" alt="Email" /></a>
</div>


This project was developed as a game-programming and Reinforcement Learning / Deep Reinforcement Learning practice project using JavaScript, Python, and PyTorch.
