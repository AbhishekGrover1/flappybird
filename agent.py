# run command: python agent.py flappybirdv0

import flappy_bird_gymnasium
import gymnasium as gym
from dqn import DQN
from experience_replay import ReplayMemory 
from collections import deque
import itertools
import yaml
import torch
import torch.nn as nn
import torch.optim as optim
import os
import argparse
import random

if torch.backends.mps.is_available():
    device = "mps"
elif torch.cuda.is_available():
    device = "cuda"
else: 
    device = "cpu"

RUNS_DIR = "runs"
os.makedirs(RUNS_DIR, exist_ok=True)

class Agent:
    def __init__(self, param_set):
        self.param_set = param_set

        with open("parameters.yaml", "r") as f:
            all_param_set = yaml.safe_load(f)
            params = all_param_set[param_set]

        self.alpha = params["alpha"]
        self.gamma = params["gamma"]

        self.epsilon_init = params["epsilon_init"]
        self.epsilon_min = params["epsilon_min"]
        self.epsilon_decay = params["epsilon_decay"]

        self.replay_memory_size = params["replay_memory_size"]
        self.mini_batch_size = params["mini_batch_size"]

        self.reward_threshold = params["reward_threshold"]
        self.network_sync_rate = params["network_sync_rate"]
        self.mini_batch_size = params["mini_batch_size"]

        self.loss_fn = nn.MSELoss()
        self.optimizer = None

        self.LOG_FILE = os.path.join(RUNS_DIR, f"{self.param_set}.log")
        self.MODEL_FILE = os.path.join(RUNS_DIR, f"{self.param_set}.pt")
        self.EPSILON_FILE = os.path.join(RUNS_DIR, f"{self.param_set}.epsilon")
        self.AVG_FILE = os.path.join(RUNS_DIR, f"{self.param_set}.bestavg")


    def run(self, is_training=True, render=False):

        env = gym.make("FlappyBird-v0", render_mode="human" if render else None)

        num_states = env.observation_space.shape[0] # input dim
        num_actions = env.action_space.n # output dim

        policy_dqn = DQN(num_states, num_actions).to(device)

        if is_training:
            memory = ReplayMemory(self.replay_memory_size)
            epsilon = self.epsilon_init
            best_reward = float("-inf")
            recent_rewards = deque(maxlen=50)
            best_avg_reward = float("-inf")

            # Resume from an existing checkpoint if one is already saved,
            # instead of always starting from random weights. Training can
            # then be safely stopped and restarted across sessions.
            if os.path.exists(self.MODEL_FILE):
                policy_dqn.load_state_dict(torch.load(self.MODEL_FILE, map_location=device))
                epsilon = 0.3  # resumed policy: mostly exploit, some continued exploration
                if os.path.exists(self.EPSILON_FILE):
                    with open(self.EPSILON_FILE) as f:
                        epsilon = float(f.read().strip())
                if os.path.exists(self.AVG_FILE):
                    with open(self.AVG_FILE) as f:
                        best_avg_reward = float(f.read().strip())
                print(f"resumed weights from {self.MODEL_FILE} -- best_avg={best_avg_reward:.2f}, epsilon={epsilon:.4f}")

            target_dqn = DQN(num_states, num_actions).to(device)
            # copy the wt & bias vals from policy => target
            target_dqn.load_state_dict(policy_dqn.state_dict())

            steps_since_sync = 0

            self.optimizer = optim.Adam(policy_dqn.parameters(), lr=self.alpha)

        else:
            # best policy load
            policy_dqn.load_state_dict(torch.load(self.MODEL_FILE, map_location=device))
            policy_dqn.eval()

        for episode in itertools.count():
            state, _ = env.reset()
            state = torch.tensor(state, dtype=torch.float, device=device)

            episode_reward = 0
            terminated = False

            while (not terminated and episode_reward < self.reward_threshold):
                if is_training and random.random() < epsilon:
                    action = env.action_space.sample() # explore
                    action = torch.tensor(action, dtype=torch.long, device=device)
                else:
                    with torch.no_grad():
                        action = policy_dqn(state.unsqueeze(dim=0)).squeeze().argmax() # exploit

                next_state, reward, terminated, _, _ = env.step(action.item())
                
                episode_reward += reward

                # create tensors
                reward = torch.tensor(reward, dtype=torch.float, device=device)
                next_state = torch.tensor(next_state, dtype=torch.float, device=device)

                if is_training:
                    memory.append((state, action, next_state, reward, terminated))
                    steps_since_sync += 1

                    # Learn every step once there's enough experience, instead
                    # of once per episode. Early episodes end in a handful of
                    # steps, so once-per-episode meant barely any gradient
                    # signal for a long time -- this alone makes training
                    # converge dramatically faster in wall-clock time.
                    if len(memory) > self.mini_batch_size:
                        mini_batch = memory.sample(self.mini_batch_size)
                        self.optimize(mini_batch, policy_dqn, target_dqn)

                        # sync the target network -- less often than before
                        # since it now trails many more optimizer steps
                        if steps_since_sync > self.network_sync_rate:
                            target_dqn.load_state_dict(policy_dqn.state_dict())
                            steps_since_sync = 0

                state = next_state

            if is_training:
                print(f"episode={episode+1} with total reward={episode_reward} & epsilon={epsilon}")
            else:
                print(f"episode={episode+1} with total reward={episode_reward}")

            if is_training:
                # epsilon decay
                epsilon = max(epsilon * self.epsilon_decay, self.epsilon_min)
                with open(self.EPSILON_FILE, "w") as f:
                    f.write(str(epsilon))

                if episode_reward > best_reward:
                    best_reward = episode_reward

                # Judge the checkpoint by a rolling average over recent
                # episodes rather than a single episode's reward -- one lucky
                # run (an easy pipe layout, a lucky random action) can beat
                # the record without the policy actually having improved.
                recent_rewards.append(episode_reward)
                if len(recent_rewards) == recent_rewards.maxlen:
                    avg_reward = sum(recent_rewards) / len(recent_rewards)
                    if avg_reward > best_avg_reward:
                        best_avg_reward = avg_reward

                        log_msg = f"best avg reward = {best_avg_reward:.2f} (single-episode best so far: {best_reward:.2f}) at episode={episode+1}"
                        with open(self.LOG_FILE, "a") as f:
                            f.write(log_msg + "\n")

                        torch.save(policy_dqn.state_dict(), self.MODEL_FILE)
                        with open(self.AVG_FILE, "w") as f:
                            f.write(str(best_avg_reward))

            # env.close() - manually stop


    def optimize(self, mini_batch, policy_dqn, target_dqn):
        # get batch of experiences
        states, actions, next_states, rewards, terminations = zip(*mini_batch)

        states = torch.stack(states)
        actions = torch.stack(actions)
        next_states = torch.stack(next_states)
        rewards = torch.stack(rewards)
        terminations = torch.tensor(terminations).float().to(device)

        # Double DQN: the policy network picks the best next action, and the
        # (more stable) target network evaluates how good that action is.
        # Using one network for both jobs (plain DQN) tends to systematically
        # overestimate Q-values -- this decoupling is a standard, cheap fix.
        with torch.no_grad():
            best_next_actions = policy_dqn(next_states).argmax(dim=1)
            next_q = target_dqn(next_states).gather(dim=1, index=best_next_actions.unsqueeze(1)).squeeze()
            target_q = rewards + (1 - terminations) * self.gamma * next_q

        # calculate y_pred i.e. Q-value from current policy
        current_q = policy_dqn(states).gather(dim=1, index=actions.unsqueeze(dim=1)).squeeze()

        # compute loss
        loss = self.loss_fn(current_q, target_q)

        # optimize model
        self.optimizer.zero_grad()
        loss.backward()
        # a handful of very large penalties (crash, near-miss) can otherwise
        # produce oversized gradients that destabilize training
        torch.nn.utils.clip_grad_norm_(policy_dqn.parameters(), max_norm=10.0)
        self.optimizer.step()


if __name__ == "__main__":
    # Parse command line inputs
    parser = argparse.ArgumentParser(description='Train or test model.')
    parser.add_argument('hyperparameters', help='')
    parser.add_argument('--train', help='Training mode', action='store_true')
    args = parser.parse_args()

    dql = Agent(param_set=args.hyperparameters)

    if args.train:
        dql.run(is_training=True)
    else:
        dql.run(is_training=False, render=True)
