# AGENTS.md

This workspace uses the following Copilot guidance files:

- Primary ROS 2 + Gazebo instructions: `.github/copilot-instructions.md`

## Agent Expectations

- Follow ROS 2 Lyrical workflows (colcon, `ament_cmake`, `ament_python`, `rclcpp`, `rclpy`).
- Prefer Gazebo Jetty (`gz`) commands and APIs.
- Keep changes minimal, consistent, and Linux reproducible.
- Avoid ROS 1 (`catkin`, `roscore`) guidance unless explicitly requested.

## Build/Test Defaults

```bash
colcon build --symlink-install
source install/setup.bash
colcon test
colcon test-result --verbose
```

For complete rules and examples, defer to `.github/copilot-instructions.md`.