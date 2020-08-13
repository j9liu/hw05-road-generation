import {vec2, vec3, mat3} from 'gl-matrix';
import Edge from './Edge';
import Node from './Node';
import Turtle from './Turtle';

export default class RoadGenerator {
  public citySize: vec2; // the specified dimensions of city space.
  public gridSize: vec2; // the number of cells along each side. Assumes that this is
                         // proportional to the city width and height.
  private cellWidth : number; // cell width ( calculated with respect to city dimensions )

  // Stores the nodes and edges that are located in each cell. The cells are in a grid
  // but are collapsed here into a one dimensional array. The cell that an item is
  // located in is given by y * cellNum + x.
  public ncells : Array<Array<Node>>;
  public ecells : Array<Array<Edge>>;

  public startPos : vec2;
  public startPosLocked : boolean = false;

  private turtles : Array<Turtle>;
  private turtlesToAdd : Array<Turtle>;
  private gridTurtles : Array<Turtle>;
  private mainRoads : Array<Edge>;
  private smallRoads : Array<Edge>;

  private waterLevel : number;

  // Highway variables
  private searchRadius : number = 100;
  private searchAngle : number = 90;
  private searchSteps : number = 6;
  private branchThreshold : number = 45;
  private hSegLengthMax : number = 100;
  private hSegLengthMin : number = 100;
  private branchFreq : number = -3;

  private maxBlocks : number = 20;
  private globalDirection : vec2 = vec2.fromValues(1.0, 0);

  private nodeEpsilon : number = 0.1;

  private nCounter : number = 0;
  private eCounter : number = 0;

  // Pixel data that is rendered in the frame buffer
  // and passed into the generator.

  private data: Uint8Array;
  private dataSize : vec2;

  constructor(cs: vec2, gs: vec2) {
    this.citySize = cs;
    this.gridSize = gs;
  }

  public setData(d: Uint8Array, ds: vec2) {
    this.data = d;
    this.dataSize = ds;
    this.reset();
  }

  public setStartPos(sp: vec2, lock: boolean) {
    vec2.copy(this.startPos, sp);
    this.startPosLocked = lock;
  }

  // Gets the green component of the image
  public getElevation(point : vec2) : number {
    let texPoint : vec2 = vec2.create();
    texPoint[0] = point[0] / this.citySize[0];
    texPoint[1] = point[1] / this.citySize[1];
    texPoint[0] = Math.floor(texPoint[0] * this.dataSize[0]);
    texPoint[1] = Math.floor(texPoint[1] * this.dataSize[1]);
    return this.data[4.0 * (texPoint[0] + this.dataSize[0] * texPoint[1]) + 1.0];
  }

  public getPopulation(point : vec2) : number {
    let texPoint : vec2 = vec2.create();
    texPoint[0] = point[0] / this.citySize[0];
    texPoint[1] = point[1] / this.citySize[1];
    texPoint[0] = Math.floor(texPoint[0] * this.dataSize[0]);
    texPoint[1] = Math.floor(texPoint[1] * this.dataSize[1]);
    return this.data[4.0 * (texPoint[0] + this.dataSize[0] * texPoint[1])];
  }

  public setWaterLevel(level: number) {
    this.waterLevel = level * 255 / 5;
  }

  public reset() {
    this.cellWidth = this.citySize[0] / this.gridSize[0];
    this.ncells = [];
    this.ecells = [];

    for(let i : number = 0; i < this.gridSize[0] * this.gridSize[1]; i++) {
      this.ncells.push([]);
      this.ecells.push([]);
    }

    this.mainRoads = [];
    this.smallRoads = [];

    this.turtles = [];
    this.turtlesToAdd = [];

    // Bias the random point towards the edges.
    if(!this.startPosLocked) {
      do {
        let xValue : number = Math.random() * 0.09 * this.citySize[0]
                              + 0.01 * this.citySize[0],
            yValue : number = Math.random() * 0.09 * this.citySize[1]
                              + 0.01 * this.citySize[1];

        if(Math.random() <= 0.5) {
          xValue += 0.90 * this.citySize[0];
        }

        if(Math.random() <= 0.5) {
          yValue += 0.90 * this.citySize[1];
        }

        this.startPos = vec2.fromValues(xValue, yValue);
      } while(this.getElevation(this.startPos) <= this.waterLevel);

      console.log("Starting position:" + this.startPos);
    }

    // Based on the random position, attempt to make the Turtle face the direction with the most
    // promising population density, as long as it points in a general direction towards the center of the map.

    let rotation : number = 0;
    let maxWeight : number = -1;

    for(let i = -360; i <= 360; i += 30) {
      let tempTurtle : Turtle = new Turtle(this.startPos, vec2.fromValues(1, 0), 0);
      tempTurtle.rotate(i);

      let weight : number = 0;
      tempTurtle.moveForward(this.cellWidth);
      if(this.getElevation(tempTurtle.position) > this.waterLevel &&
         !this.outOfBounds(tempTurtle.position)) {
        weight = this.getPopulation(tempTurtle.position);
      }

      if(weight > maxWeight) {
        rotation = i;
        maxWeight = weight;
      }
    }

    let candidate : vec2 = vec2.fromValues(this.cosDeg(rotation), this.sinDeg(rotation));
    let turtleToCenter : vec2 = vec2.fromValues(this.citySize[0] * 0.5 - this.startPos[0],
                                                this.citySize[1] * 0.5 - this.startPos[1]);

    vec2.normalize(turtleToCenter, turtleToCenter);

    let finalDir : vec2 = vec2.create();

    let angle : number = this.acosDeg(candidate[0] * turtleToCenter[0] +
                                      candidate[1] * turtleToCenter[1]);

    if(angle > 90) {
      vec2.copy(finalDir, turtleToCenter);
    } else {
      vec2.copy(finalDir, candidate);
    }

    let t : Turtle = new Turtle(this.startPos, finalDir, -1);
    this.turtles.push(t);
  }

  // Given height and population data, generate a substantial set of roads that covers it
  public generateRoads() {
    let maxIterations : number = 15;
   
     //this.mainRoads.push(new Edge(vec.fromValues(0, 0), citySize, 0, true));
     //this.branchGrid(this.mainRoads[0]);
     
     for(let j = 0; j < maxIterations && this.turtles.length > 0; j++) {
     // console.log(this.turtles.length);
      
      for(let i = 0; i < this.turtles.length; i++) {
        this.branchRoad(this.turtles[i]);
      }

      let activeTurtles : Array<Turtle> = [];

      for(let i = 0; i < this.turtles.length; i++) {
        if(this.drawRoad(this.turtles[i])) {
          activeTurtles.push(this.turtles[i]);
        }
      } 

      this.turtles = activeTurtles;

      this.turtles = this.turtles.concat(this.turtlesToAdd);
      this.turtlesToAdd = [];
    }

    console.log("done!");
  }

  public getMainRoads() : Array<Edge> {
    return this.mainRoads;
  }

  public getSmallRoads() : Array<Edge> {
    return this.smallRoads;     
  }

  //////////////////////////////////////
  // GENERAL HELPER FUNCTIONS
  //////////////////////////////////////

  public outOfBounds(pos: vec2): boolean {
    return pos[0] < 0 || pos[0] > this.citySize[0] || pos[1] < 0 || pos[1] > this.citySize[1];
  }

  // manages equality with a larger epsilon
  private vec2Equality(v1: vec2, v2: vec2) {
    return Math.abs(v1[0] - v2[0]) < this.nodeEpsilon
        && Math.abs(v1[1] - v2[1]) < this.nodeEpsilon;
  }

  private cosDeg(deg: number): number {
    let rad: number = deg * Math.PI / 180;
    return Math.cos(rad);
  }

  private sinDeg(deg: number): number {
    let rad: number = deg * Math.PI / 180;
    return Math.sin(rad);
  }

  private acosDeg(value: number): number {
    return Math.acos(value) * 180 / Math.PI;
  }

  //////////////////////////////////////
  // CELL MANAGEMENT HELPER FUNCTIONS
  //////////////////////////////////////

  public getPosRowNumber(p: vec2): number {
    return Math.floor(p[1] / this.cellWidth);
  }

  public getPosColNumber(p: vec2) : number {
    return Math.floor(p[0] / this.cellWidth)
  }

  public getPosCellNumber(p: vec2) : number {
    let cellx : number = Math.floor(p[0] / this.cellWidth), 
        celly : number = Math.floor(p[1] / this.cellWidth);

    let celln : number = Math.floor(this.gridSize[0] * celly + cellx);
    if(celln < 0 || celln >= this.gridSize[0] * this.gridSize[1]) {
      return undefined;
    }

    return celln;
  }

  // Given a vec2 position, see if there is an existing
  // node that marks that position.
  public getNodeAtPos(pos: vec2) : Node {
    if(this.outOfBounds(pos)) {
      return undefined;
    }

    let nArray : Array<Node> = this.ncells[this.getPosCellNumber(pos)];
    if(nArray == undefined) {
      return undefined;
    }

    for(let i = 0; i < nArray.length; i++) {
      if(this.vec2Equality(nArray[i].getPosition(), pos)) {
        return nArray[i];
      }
    }
    return undefined;
  }

  // Given an edge, find all of the cells that it intersects
  public getEdgeCells(e: Edge) : Array<number> {
    let ret : Array<number> = [];

    let leftBound : number = this.getPosColNumber(e.endpoint1);
    let rightBound : number = this.getPosColNumber(e.endpoint2);
    let bottomBound : number = this.getPosRowNumber(e.endpoint1);
    let topBound : number = this.getPosRowNumber(e.endpoint2);

    if(leftBound > rightBound) {
      rightBound = leftBound;
      leftBound = this.getPosColNumber(e.endpoint2);
    }

    if(bottomBound > topBound) {
      topBound = bottomBound;
      bottomBound = this.getPosRowNumber(e.endpoint2);
    }

    rightBound = Math.min(rightBound, this.gridSize[0]);
    topBound = Math.min(topBound, this.gridSize[1]);

    for(let j = bottomBound; j <= topBound; j++) {
      for(let i = leftBound; i <= rightBound; i++) {

        let cellNumber = this.gridSize[0] * j + i;
        if(cellNumber < 0 || cellNumber >= this.gridSize[0] * this.gridSize[1]) {
          continue; // cell out of bounds
        }

        if(e.intersectQuad(vec2.fromValues(i * this.cellWidth, j * this.cellWidth),
                           vec2.fromValues((i + 1) * this.cellWidth, (j + 1) * this.cellWidth))) {
          ret.push(cellNumber);
        }
      }
    }
    return ret;
  }

  // Given a node, sort it into the cell map as long as there
  // isn't another existing node at that position. If the node
  // is unable to be fit, return false
  public sortNode(n: Node) : boolean {
    if(this.outOfBounds(n.getPosition())) {
      return false;
    }

    let array : Array<Node> = this.ncells[this.getPosCellNumber(n.getPosition())];

    for(let i: number = 0; i < array.length; i++) {
      if(n.equals(array[i], this.nodeEpsilon)) {
        return false;
      }
    }
    
    array.push(n);

    return true;
  }


  // Given an edge, sort it into the cell map, i.e. find all of the cells
  // that it overlaps and store it in those cells' datasets.
  public sortEdge(e: Edge) : boolean {
    let cells : Array<number> = this.getEdgeCells(e);
    if(cells == undefined || cells.length == 0) {
      return false;
    }
    
    for(let i: number = 0; i < cells.length; i++) {
      this.ecells[cells[i]].push(e);
    }
    return true;
  }

  public willIntersect(t1: Turtle, t2: Turtle) : boolean {
    let p : vec2 = t1.position;
    let r : vec2 = t1.orientation;
    let q : vec2 = t2.position;
    let s : vec2 = t2.orientation;

    let qp : vec2 = vec2.create();
    vec2.subtract(qp, q, p);

    let qpxr : number = qp[0] * r[1] - qp[1] * r[0];
    let qpxs : number = qp[0] * s[1] - qp[1] * s[0];

    let rxs : number = r[0] * s[1] - r[1] * s[0];

    if(Math.abs(rxs) < 0.01) {
      return false;
    }

    let u : number = qpxr / rxs;
    let t : number = qpxs / rxs;

    return u >= 0 && t >= 0;

  }

  //////////////////////////////////////
  // ROAD DRAWING & FUNCTIONS
  //////////////////////////////////////

  private branchRoad(t: Turtle) {
    if(t.depth < 0) {
      this.branchHighway(t, this.searchAngle, this.searchRadius);
    }
  }

  // store the distance travelled in the turtle.
  // Rotates the turtle such that it will draw in the direction of the most
  // highly weighted direction above a certain threshold, while generating
  // a new Turtle if 1. turtle rotates enough off its original course and
  // 2. the population of the original direction is high enough


  // Branches the highways if the turtle has travelled more than the radius.

  // THEN ATTEMPT TO IMPLEMENT INTERSECTION DETECTION
   private branchHighway(t: Turtle, angle: number, radius : number) {

    let rotation : number = 0;
    let secondRotation : number = 0;
    let maxWeight : number = -1;
    let secondMaxWeight : number = -1;

    let currentWeight : number = -1;

    for(let i = -angle / 2; i <= angle / 2; i += angle / 8) {
      let tempTurtle : Turtle = new Turtle(t.position,
                                           t.orientation,
                                           -1);
      tempTurtle.rotate(i);
      let weight : number = 0;

      for(let j = 0; j < this.searchSteps; j++) {
        tempTurtle.moveForward(radius / this.searchSteps);
        if(this.outOfBounds(tempTurtle.position)) {
          break;
        }
        if(this.getElevation(tempTurtle.position) > this.waterLevel) {
          weight += this.getPopulation(tempTurtle.position)
                       / vec2.distance(tempTurtle.position, t.position);
        }
      }

      // extended search for current road
      if(Math.abs(i) < 0.1) {
        currentWeight = weight;
        for(let j = 0; j < this.searchSteps / 2; j++) {
          tempTurtle.moveForward(radius / (4 * this.searchSteps));
          if(this.outOfBounds(tempTurtle.position)) {
            break;
          }
          if(this.getElevation(tempTurtle.position) > this.waterLevel) {
            currentWeight += this.getPopulation(tempTurtle.position)
                         / vec2.distance(tempTurtle.position, t.position);
          }
        }
      }

      if(weight > maxWeight) {
        secondRotation = rotation;
        secondMaxWeight = maxWeight;
        rotation = i;
        maxWeight = weight;
      } else if (weight > secondMaxWeight) {
        secondRotation = i;
        secondMaxWeight = weight;
      }
    }

  /*
    // scan for nearby turtles
    for(let i = 0; i < this.highwayTurtles.length; i++) {
      if(!this.vec2Equality(t.position, this.highwayTurtles[i].position) &&
          vec2.distance(t.position, this.highwayTurtles[i].position) <= this.searchRadius) {
        // check if their current trajectories are going to intersect
        if(this.willIntersect(t, this.highwayTurtles[i])) {
          this.highwayTurtles[i]
        }
      }
    }*/

    let nt : Turtle = new Turtle(t.position, t.orientation, -1);

    // Branch if the threshold is passed & the original direction is promising enough
    if(Math.abs(rotation) > this.branchThreshold && Math.abs(currentWeight - maxWeight) >
         Math.abs(currentWeight - secondMaxWeight)) {
       this.turtlesToAdd.push(nt);
    }

    // otherwise try to branch with the two max-weighted directions
    else if(Math.abs(rotation - secondRotation) > this.branchThreshold * 1.5) {
      nt.rotate(secondRotation);
      this.turtlesToAdd.push(nt);
    }

    if(Math.abs(t.rotationTotal + rotation) < 150) {
      t.rotate(rotation);
      t.rotationTotal += rotation;
    }
  }

  private branchGrid(e: Edge) {
    // We use the Turtle "depth" to store numbers 
    let minLength : number = 10;

    let stepLength : number = Math.max(minLength, e.getLength() / this.maxBlocks);
    let maxSteps : number = Math.floor(e.getLength() / stepLength);

    let dir : vec2 = e.getDirectionVector();
    let perpLocal : vec2 = dir[1] != 0 ? vec2.fromValues(1, -dir[0] / dir[1]) 
                                       : vec2.fromValues(0, 1);
    let perpGlobal : vec2 = this.globalDirection[1] != 0
                                      ? vec2.fromValues(1, -this.globalDirection[0] / this.globalDirection[1])
                                      : vec2.fromValues(0, 1);
    
    vec2.normalize(perpLocal, perpLocal);
    vec2.normalize(perpGlobal, perpGlobal);

    let anglePerp : number = Math.acos(vec2.dot(perpLocal, this.globalDirection) /
                         (vec2.length(perpLocal) * vec2.length(this.globalDirection)));

    let angleRoadDir : number = Math.acos(vec2.dot(dir, this.globalDirection) /
                         (vec2.length(dir) * vec2.length(this.globalDirection)));

    // change direction depending on which (if any)
    // of the two directions are closest to direction vector
    let gridDir : vec2 = vec2.create();
    let gridPerpDir : vec2 = vec2.create();
    
    if(anglePerp * 57.2957795 < 15) { 
      vec2.copy(gridDir, this.globalDirection);
      vec2.copy(gridPerpDir, perpGlobal);
    } else if (angleRoadDir * 57.2957795 < 15) {
      vec2.copy(gridDir, perpGlobal);
      vec2.copy(gridPerpDir, this.globalDirection);
    } else {
      gridDir = perpLocal;
      gridPerpDir = dir;
    }

    // This turtle marches along the existing highway to spawn grid turtles along the sides
    let tempTurtle : Turtle = new Turtle(e.endpoint1, dir, 0);
    for(let i : number = 0; i <= maxSteps; i++) {
      tempTurtle.moveForward(stepLength);
      let t : Turtle = new Turtle(tempTurtle.position, gridDir, 0);
      t.stepLength = stepLength;
      vec2.copy(t.stepDir, gridPerpDir);
      this.gridTurtles.push(t);
    }
  }

  private drawRoad(t: Turtle): boolean {
    if(t.depth < 0) {
      return this.drawHighway(t);
    }
    return this.drawGrid(t);
  }

  private drawHighway(t: Turtle) : boolean {
    Math.random();
    let oldPos : vec2 = vec2.fromValues(t.position[0], t.position[1]);
    t.moveForward(this.hSegLengthMin);
    let endpoint : Node = new Node(oldPos, this.nCounter);
    let road : Edge = new Edge(oldPos, vec2.fromValues(t.position[0], t.position[1]), this.eCounter, true);
    if(!this.fixForConstraints(road)) {
      return false;
    }

    vec2.copy(t.position, road.endpoint2);

    this.nCounter++;
    this.eCounter++;
    this.sortEdge(road);
    this.sortNode(endpoint);
    this.mainRoads.push(road);

    //this.branchGrid(road);

    return true;
  }

  private drawGrid(t: Turtle) : boolean {
    if(t.depth >= this.maxBlocks) {
      return false;
    }

    let upRoadDrawn : boolean = false;
    let forwardRoadDrawn : boolean = false;

    let oldPos : vec2 = vec2.fromValues(t.position[0], t.position[1]);
    let oldOri : vec2 = vec2.fromValues(t.orientation[0], t.orientation[1]);
    if(t.depth > 0) {
      t.setOrientation(t.stepDir);
      t.moveForward(t.stepLength);
      let endpoint : Node = new Node(oldPos, this.nCounter);
      let road : Edge = new Edge(oldPos, vec2.fromValues(t.position[0], t.position[1]), this.eCounter, false);
      if(this.fixForConstraints(road)) {
        this.nCounter++;
        this.eCounter++;
        this.sortEdge(road);
        this.sortNode(endpoint);
        this.smallRoads.push(road);
        upRoadDrawn = true;
      }
      t.setPosition(oldPos);
      t.setOrientation(oldOri);
    }

    t.moveForward(20);
    let road : Edge = new Edge(oldPos, vec2.fromValues(t.position[0], t.position[1]), this.eCounter, false);
    if(this.fixForConstraints(road)) {
      this.eCounter++;
      this.sortEdge(road);
      this.smallRoads.push(road);
      forwardRoadDrawn = true;
      t.depth++;
    }

    return upRoadDrawn || forwardRoadDrawn;
  }

  //////////////////////////////////////
  // ROAD CONSTRAINT HELPER FUNCTIONS
  //////////////////////////////////////

  private fixForConstraints(e: Edge) : boolean {
    return this.fixForBounds(e) && this.fixForWater(e);// && this.fixForNearbyRoads(e);
  }

  private fixForBounds(e: Edge): boolean {
    if(this.outOfBounds(e.endpoint2)) {
      // try to shorten
      return false;
    }

    return true;
  }

  // Checks if the edge goes into the water and tries to adjust the endpoints'
  // positions accordingly. If the resulting edge can fit on land or is long enough
  // to be a worthwhile road, return true; else, return false.

  private fixForWater(e: Edge): boolean {
    
    // If the road is a highway, and it ends in a body of water,
    // we can try to extend it to a piece of land within reach.
    // Otherwise, we let the highway dangle, anticipating that it can be shortened
    // back towards land.

    if(e.highway) {
      
      // Test if the newest endpoint is in the water.
      if(this.getElevation(e.endpoint2) > this.waterLevel) {
        return true;
      }
      
      console.log("correcting!");
      let increment : vec2 = vec2.create();
      vec2.scale(increment, e.getDirectionVector(), this.hSegLengthMin)
      let temp : vec2 = vec2.fromValues(e.endpoint2[0], e.endpoint2[1]);
      for(let i = 0; i < 10; i++) {
        vec2.add(temp, temp, increment);
        if(this.getElevation(temp) > this.waterLevel && !this.outOfBounds(temp)) {
          vec2.copy(e.endpoint2, temp);
          return true;
        }
      }
    }

    // Otherwise, if the road is part of the grid network, we check
    // if the road at any point (within reasonable testing) crosses water.
    // If so, we truncate the road so it's as long as possible before hitting
    // water.

    let testPoint : vec2 = vec2.create();
    vec2.copy(testPoint, e.endpoint1);
    let increment : vec2 = e.getDirectionVector();
    vec2.scale(increment, increment, e.getLength() / 10);
    for(let i = 0; i < 10; i++) {
      vec2.add(testPoint, testPoint, increment);
      if(this.getElevation(testPoint) <= this.waterLevel) {
        vec2.copy(e.endpoint2, testPoint);
        break;
      }
    }
    return e.getLength() >= 2 * vec2.length(increment);
  }

  // Adjusts the road based on the surrounding road network,
  // adds intersections where necessary. If the resulting edge is long enough
  // to be a worthwhile road, return true; else, return false.
  
  private fixForNearbyRoads(e: Edge) : boolean {
    
    // Search for the closest Node; if it falls within a small radius, snap
    // the edge to that node.
    let endCell : number = this.getPosCellNumber(e.endpoint2);

    let closest: Node = undefined;
    let closestDistance: number = Math.max(this.citySize[0], this.citySize[1]);

    if(endCell != undefined) {
      for(let i = 0; i < this.ncells[endCell].length; i++) {
        if(this.ncells[endCell][i].distanceFrom(e.endpoint2) < closestDistance) {
          closest = this.ncells[endCell][i];
        }
      }

      if(closest != undefined && closestDistance < this.hSegLengthMin) {
        vec2.copy(e.endpoint2, closest.getPosition());
      }
    }

    // Add new intersections where the edge intersects other edges;
    // keep track of the closest one, and if it is within a reasonable
    // threshold, snap the end of the edge to that intersection

    let interCells : Array<number> = this.getEdgeCells(e);
    for(let i = 0; i < interCells.length; i++) {
      for(let j = 0; j < this.ecells[i].length; j++) {
        let inter : vec2 = e.intersectEdge(this.ecells[i][j]);
        if(inter != undefined && this.getNodeAtPos(inter) == undefined) {
          let n : Node = new Node(inter, this.nCounter);
          this.nCounter++;
        }
      }
    }

    return e.getLength() >= this.hSegLengthMin; return true;
  }  
}