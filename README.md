# Road Generation
**By Janine Liu / jliu99**

# External Resources

In addition to the class lectures and powerpoints, I consulted a few external resources for this project:
- https://stackoverflow.com/questions/41855261/calculate-the-angle-between-a-line-and-x-axis, for the formula for calculating the angle between a given line and the x-axis.
- https://stackoverflow.com/questions/4977491/determining-if-two-line-segments-intersect/4977569, for a method of checking whether two line segments intersect or not.

# Live GitHub demo
https://j9liu.github.io/roadgen/

# Network Representation

Due to the tweakable, self-sensitive nature of the network, the roads needed to be stored as mutatable data before they were committed to visuals. Therefore, the roads are represented as instances of an Edge class, which is defined by two instances of a Node class. While the Nodes mark the terminating points of an Edge, they also effectively represent intersections where multiple Edges can meet; therefore, a Node also keeps track of what edges are adjacent to it. An Edge can also check for intersections with other edges.

# Cityspace Set-Up

We define the space in which the roads are initially created as "cityspace." The bounds of cityspace are defined from (0, 0) in the bottom left corner to a specified (width, height) in the upper right corner.

![](grid.png)

Our road generator operates within the coordinates of this cityspace to produce roads, then uses its own projection matrix to transform the network cityspace coordinates (from (0, 0) and (width, height)) to screen coordinates (from (-1, -1) and (1, 1)), such that they can be displayed in the 2D view as shown.

# L-System Ruleset

I took my L-System framework from my [previous project](https://j9liu.github.io/hw4/) as a basis for the behavior of the road generator. While there were no strings and expansion rules involved, I used my implementation of the DrawingRule class to clarify probabilistic behaviors for the Turtle that draws the roads. To pick an outcome, I would generate a random number, then sum the probability of the rules until it was equal to or greater than the random number. Due to the use of the Math.random() function, the seed is not consistent and changes when generating a new road network.

**Basic Road Branching Rules**
- (17.5% probability) Draw a highway within a user-specified angle. 

- (20% probability) Draw multiple highways using the same rules as 

- (12.5% probability) Draw smaller roads.

- Rotate 45 degrees counter-clockwise.

- Rotate 45 degrees clockwise.

**Grid Road Drawing Rules**

# Drawing With Self Sensitivity


# Aesthetic Features

The height map generated looks as follows from a strictly land-water view. 

![](landwater.png)

![](elevation.png)

![](population.png)

![](elevationpopulation.png)