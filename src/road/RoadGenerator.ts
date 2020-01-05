import {vec2, vec3, mat3} from 'gl-matrix';
import Edge from './Edge';
import Node from './Node';
import Turtle from './Turtle';

export default class RoadGenerator {
  public length: number; // the specified dimensions of city space. length x length
  public cellNum: number; // the number of cells along each side
  private cellW : number; // cell width ( calculated with respect to city length )

  // Stores the nodes and edges that are located in each cell. The cells are in a grid
  // but are collapsed here into a one dimensional array. The cell that an item is
  // located in is given by y * cellNum + x.
  public ncells : Array<Array<Node>>;
  public ecells : Array<Array<Edge>>;

  // Main roads are highways and other major roads,
  // while small roads are, as described, smaller roads.
  // The distinction is made such that they can be rendered
  // with different colors and sizes

  private currentTurtle : Turtle;
  private turtles : Array<Turtle>;
  private mainRoads : Array<Edge>;
  private smallRoads : Array<Edge>;

  private getElevation : any;
  private getPopulation : any;
  private waterLevel : number;

  private searchRadius : number = 40;
  private searchAngle : number = 90;
  private searchSteps : number = 10;
  private branchThreshold : number = 45;


  private hSegLengthMax : number = 30;
  private hSegLengthMin : number = 1;
  private blockWidthMax : number = 40;

  private nodeEpsilon : number = 0.1;

  private nCounter : number = 0;
  private eCounter : number = 0;

  constructor(l: number, cn: number) {
    this.length = l;
    this.cellNum = cn;
    this.reset();
  }

  public reset() {
    this.cellW = this.length / this.cellNum;
    this.ncells = [];
    this.ecells = [];
    for(let i : number = 0; i < this.cellNum * this.cellNum; i++) {
      this.ncells.push([]);
      this.ecells.push([]);
    }

    this.mainRoads = [];
    this.smallRoads = [];
    this.turtles = [];

    let randAngle : number = Math.random() * 360;
    this.turtles.push(new Turtle(vec2.fromValues(Math.random() * length, Math.random() * length),
                                 vec2.fromValues(Math.cos(randAngle), Math.sin(randAngle)), 0));
  }

  // Given height and population data, generate a substantial set of roads that covers it
  public generateRoads(height: any, population: any, waterlevel: number) {
    this.getElevation = height;
    this.getPopulation = population;
    this.waterLevel = waterlevel;

    while(this.turtles.length > 0) {
      for(let i = 0; i < this.turtles.length; i++) {
        if(!this.drawRoad(this.turtles[i])) {
          this.turtles = this.turtles.splice(i, 1);
          i--;
        }
      }
    }

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

  public outOfBounds(pos: vec2) : boolean {
    return pos[0] < 0 || pos[0] > this.length || pos[1] < 0 || pos[1] > this.length;
  }

  // manages equality with a larger epsilon
  private vec2Equality(v1: vec2, v2: vec2) {
    return Math.abs(v1[0] - v2[0]) < this.nodeEpsilon
        && Math.abs(v1[1] - v2[1]) < this.nodeEpsilon;
  }

  //////////////////////////////////////
  // CELL MANAGEMENT HELPER FUNCTIONS
  //////////////////////////////////////

  public getPosRowNumber(p: vec2): number {
    return Math.floor(p[1] / this.cellW);
  }

  public getPosColNumber(p: vec2) : number {
    return Math.floor(p[0] / this.cellW)
  }

  public getPosCellNumber(p: vec2) : number {
    let cellx : number = Math.floor(p[0] / this.cellW), 
        celly : number = Math.floor(p[1] / this.cellW);
    return this.cellNum * celly + cellx;
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

    rightBound = Math.min(rightBound, this.cellNum);
    topBound = Math.min(topBound, this.cellNum);

    for(let j = bottomBound; j <= topBound; j++) {
      for(let i = leftBound; i <= rightBound; i++) {

        let cellNumber = this.cellNum * j + i;
        if(cellNumber < 0 || cellNumber >= this.cellNum * this.cellNum) {
          continue; // cell out of bounds
        }

        if(e.intersectQuad(vec2.fromValues(i * this.cellW, j * this.cellW),
                           vec2.fromValues((i + 1) * this.cellW, (j + 1) * this.cellW))) {
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

  //////////////////////////////////////
  // ROAD DRAWING & FUNCTIONS
  //////////////////////////////////////

  // Rotates the turtle such that it will draw in the direction of the most
  // highly weighted direction above a certain threshold, while generating
  // a new Turtle if 1. turtle rotates enough off its original course and
  // 2. the population of the original direction is high enough
   private branchHighway(t: Turtle, angle: number, radius : number) {
    let rotation : number = 0;
    let maxWeight : number = -1;

    for(let i = -angle / 2; i <= angle / 2; i += angle / 6) {
      let tempTurtle : Turtle = new Turtle(t.position,
                                           t.orientation,
                                           t.depth);
      tempTurtle.rotate(i);
      let weight : number = 0;

      for(let j = 0; j < this.searchSteps; j++) {
        tempTurtle.moveForward(radius / this.searchSteps);
        if(this.getElevation(tempTurtle.position) > this.waterLevel) {
          weight += this.getPopulation(tempTurtle.position) / vec2.distance(tempTurtle.position, t.position);
        }
      }

      if(weight > maxWeight) {
        rotation = i;
        maxWeight = weight;
      }
    }

    if(Math.abs(rotation) > this.branchThreshold && this.mainRoads.length > 0) {
      this.turtles.push(new Turtle(t.position, t.orientation, t.depth - 1));
    }

    t.rotate(rotation);
  }

  private branchGrid(t: Turtle, numBlocks: number) {

  }

  private drawRoad(t: Turtle): boolean {
    if(t.depth == -1) {
      return this.drawHighway(t);
    }
    
    return this.drawGrid(t);
  }

  private drawHighway(t: Turtle) : boolean {
    if(t.depth == -1) {
      this.branchHighway(t, this.searchAngle, this.searchRadius);
    }
    let oldPos : vec2 = this.currentTurtle.position;
    this.currentTurtle.moveForward(this.hSegLengthMin);
    let endpoint : Node = new Node(oldPos, this.nCounter);
    let road : Edge = new Edge(oldPos, this.currentTurtle.position, this.eCounter, true);
    if(!this.fixForWater(road) || !this.fixForNearbyRoads(road)) {
      return false;
    }

    this.nCounter++;
    this.eCounter++;
    this.sortEdge(road);
    this.sortNode(endpoint);
    this.mainRoads.push(road);
    t.depth = -1;
    return true;
  }


  private drawGrid(t: Turtle) : boolean {
    /*let blockWidth = 40;
    let maxBlocks : number = Math.floor(Math.random() * e.getLength() / blockWidth);
    let parallel : vec2 = e.getDirectionVector();
    let perpendicular : vec2 = vec2.fromValues(1, -parallel[0] / parallel[1]);
    vec2.normalize(perpendicular, perpendicular);
    vec2.copy(turtle.position, e.endpoint1);
    vec2.copy(turtle.orientation, parallel);
    for(let i = 0; i < maxBlocks; i++) {
      turtle.moveForward(blockWidth);
      let perpEdge : Edge = new Edge(turtle.position, vec2.fromValues(maxBlocks * perpendicular[0],
                                                                      maxBlocks * perpendicular[1]),
                                     ecounter, false);
      if(fixForBounds(perpEdge) && fixForWater(perpEdge) && fixForNearbyRoads(perpEdge)) {
        ecounter++;
        sortEdge(perpEdge);
        smallRoads.push(perpEdge);
      }

      if(i == 0) {
        pushTurtle();
        vec2.copy(turtle.orientation, perpendicular);
        for(let j = 0; j < maxBlocks; j++) {
          turtle.moveForward(blockWidth);
          let parEdge : Edge = new Edge(turtle.position, vec2.fromValues(maxBlocks * parallel[0],
                                                                         maxBlocks * parallel[1]),
                                        ecounter, false);
          if(fixForBounds(parEdge) && fixForWater(parEdge) && fixForNearbyRoads(parEdge)) {
            ecounter++;
            sortEdge(parEdge);
            smallRoads.push(parEdge);
          }
        }
        popTurtle();
      }
    }*/

    return false;
  }

  //////////////////////////////////////
  // ROAD CONSTRAINT HELPER FUNCTIONS
  //////////////////////////////////////

  // Checks if the edge goes into the water and tries to adjust the endpoints'
  // positions accordingly. If the resulting edge can fit on land or is long enough
  // to be a worthwhile road, return true; else, return false.
  //

  private fixForWater(e: Edge): boolean {
    // Test if the newest endpoint is in the water.
    if(this.getElevation(e.endpoint2) >= this.waterLevel) {
      return true;
    }

    // If the road is a highway, we can try to extend it to an island within reach,
    // as long as it is under the maximum highway length. Otherwise, we let the
    // highway dangle, anticipating that it can be shortened back towards land.
    if(e.highway && e.getLength() < this.hSegLengthMax) {
      let increment : vec2 = e.getDirectionVector();
      vec2.scale(increment, increment, (this.hSegLengthMax - e.getLength()) / 5);
      let temp : vec2 = vec2.create();
      vec2.copy(temp, e.endpoint2);
      for(let i = 0; i < 5; i++) {
        vec2.add(temp, temp, increment);
        if(this.getElevation(temp) >= this.waterLevel) {
          vec2.copy(e.endpoint2, temp);
          return true;
        }
      }
    }

    // Otherwise, we slowly march the end of the edge back in the direction of the road
    // until we either find water or reach the start point.
    let increment : vec2 = e.getDirectionVector();
    vec2.scale(increment, increment, e.getLength() / 10);
    let temp : vec2 = vec2.create();
    for(let i = 0; i < 10; i++) {
      vec2.subtract(temp, e.endpoint2, increment);
      vec2.copy(e.endpoint2, temp);
      if(this.getElevation(e.endpoint2) >= this.waterLevel) {
        break;
      }
    }
    return e.getLength() >= this.hSegLengthMin;
  }

  // Adjusts the road based on the surrounding road network,
  // adds intersections where necessary. If the resulting edge is long enough
  // to be a worthwhile road, return true; else, return false.
  
  private fixForNearbyRoads(e: Edge) : boolean {/*
    // Search for the closest Node; if it falls within a small radius, snap
    // the edge to that node.
    let endCell : number = this.getPosCellNumber(e.endpoint2.getPosition());
    let closest: Node = undefined;
    let closestDistance: number = 1000;
    if(endCell != undefined) {
      for(let i = 0; i < ncells[endCell].length; i++) {
        if(this.ncells[endCell][i].distanceFrom(e.endpoint2) < closestDistance) {
          closest = this.ncells[endCell][i];
        }
      }
      if(closest != undefined && closestDistance < 30) {
        vec2.copy(e.endpoint2, closest.position);
      }
    }

    // Add new intersections where the edge intersects other edges;
    // keep track of the closest one, and if it is within a reasonable
    // threshold, snap the end of the edge to that intersection
    let interCells : Array<number> = this.getEdgeCells(e);
    for(let i = 0; i < interCells.length; i++) {
      for(let j = 0; j < this.ecells[i].length; j++) {
        let inter : vec2 = e.intersectionEdge(this.ecells[i][j]);
        if(inter != undefined && getNode(inter) == undefined) {
          let n : Node = new Node(inter, this.ncounter);
          this.ncounter++;
        }
      }
    }

    return e.getLength() >= this.hSegLengthMin;*/
    return true;
  }  
}