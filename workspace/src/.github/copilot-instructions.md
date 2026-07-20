# Copilot Instructions for ROS 2 Lyrical + Gazebo Jetty

These instructions define how Copilot should assist in this repository.

## Scope and Assumptions

- Target middleware stack: ROS 2 Lyrical.
- Target simulator: Gazebo Jetty.
- Workspace style: colcon-based ROS 2 workspace.
- Favor solutions aligned with official ROS 2 Lyrical tutorials and Gazebo Jetty documentation.

## General Expectations

- Prefer small, reviewable changes over broad refactors.
- Preserve existing package names, topic names, frame IDs, and interface contracts unless explicitly asked.
- When proposing a new dependency, explain why it is needed and keep it minimal.
- Keep instructions and snippets reproducible on Linux.

## Code Generation Rules

### ROS 2 Package Layout

- Use standard ROS 2 package structures:
  - C++: `ament_cmake`
  - Python: `ament_python`
- Ensure generated code updates all relevant files consistently:
  - `package.xml`
  - `CMakeLists.txt` (for `ament_cmake`)
  - `setup.py` / `setup.cfg` (for `ament_python`)
  - `launch/` and `config/` assets when needed

### Nodes and APIs

- Prefer clear node names and explicit parameter declarations.
- For C++, prefer `rclcpp::NodeOptions` and parameterized constructors where useful.
- For Python, use `rclpy` patterns that match ROS 2 tutorials.
- Keep QoS explicit for sensor and simulation topics; avoid implicit defaults for high-rate streams.

### Topics, TF, and Messages

- Do not invent custom message types when standard interfaces are sufficient.
- Use consistent frame conventions (`map`, `odom`, `base_link`, sensor frames) and document assumptions.
- For transforms, prefer `tf2_ros` patterns used in ROS 2 tutorials.

### Launch Files

- Prefer Python launch files for composability.
- Use launch arguments for paths, namespace, simulation time, and robot model selection.
- Set `use_sim_time` explicitly for simulation workflows.

## Build, Test, and Quality Commands

When suggesting commands, prefer this sequence and adapt paths as needed:

```bash
# From workspace root (example: /ros_ws)
colcon build --symlink-install
source install/setup.bash

# Run tests
colcon test
colcon test-result --verbose
```

For package-scoped work:

```bash
colcon build --packages-select <pkg_name> --symlink-install
colcon test --packages-select <pkg_name>
```

For linting, prefer ROS 2 standard linters where configured (`ament_lint_auto`, `ament_cpplint`, `ament_flake8`, `ament_uncrustify`).

## Gazebo Jetty Integration Guidance

- Prefer modern Gazebo (`gz`) tooling and APIs compatible with Jetty.
- Keep simulation resources organized (worlds, models, meshes, plugins) under package directories and install them correctly.
- Use launch patterns that make simulator startup optional via launch args.
- If bridging with ROS 2 topics, use explicit bridge mappings and document directionality.

Example simulator command style:

```bash
gz sim <world_file.sdf>
```

## URDF/Xacro and SDF Practices

- Prefer Xacro macros for reusable robot descriptions.
- Keep inertial, collision, and visual elements coherent.
- Avoid placeholder inertias in final code unless clearly marked as temporary.
- Validate model paths and plugin references to avoid runtime lookup failures.

## Debugging and Reproducibility

- When troubleshooting, provide step-by-step commands with expected outcomes.
- Use ROS 2 CLI tools in examples:
  - `ros2 topic list|echo|hz`
  - `ros2 node list|info`
  - `ros2 param list|get|set`
  - `ros2 launch ...`
- Include environment assumptions (sourced setup files, `ROS_DOMAIN_ID`, and simulator resource paths) when relevant.

## Documentation and References

- Align recommendations with:
  - ROS 2 Lyrical Tutorials: https://docs.ros.org/en/lyrical/Tutorials.html
  - Gazebo Jetty docs and install pages: https://gazebosim.org/docs/latest/install/
- If uncertainty exists between distributions/releases, call it out explicitly and suggest verification steps.

## What Copilot Should Avoid

- Do not mix ROS 1 (`catkin`, `roscore`) workflows into ROS 2 guidance.
- Do not suggest deprecated Gazebo Classic commands when Jetty-native alternatives are expected.
- Do not hardcode absolute machine-specific paths in launch or config files unless asked.
