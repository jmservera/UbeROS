# Place ROS 2 packages here.

This directory is bind-mounted into both the ROS container (/ros_ws/src) and
the code editor, so files you create here are immediately visible to colcon
and to the browser editor. Build artifacts (build/ install/ log/) live in the
ros-workspace named volume, not on the host.

Create a package, for example:
```bash
   ros2 pkg create --build-type ament_python my_package
```

## Testing the environment

Open the Turtlesim window and try this command in the ROS terminal:

```bash
ros2 run turtlesim turtle_teleop_key
```

If it runs correctly you will be able to move the turtle with the arrow keys. If it does not run, check that the simulator is running in the Simulators menu and that the ROS container is healthy (`docker compose ps`).