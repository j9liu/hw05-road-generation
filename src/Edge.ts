import {vec2} from 'gl-matrix';
import Node from './Node'

export default class Edge {
  endpoint1 : Node;
  endpoint2 : Node;
  id : number;
  highway : boolean;

  constructor(end1: Node, end2: Node, i: number, h: boolean) {
  	this.endpoint1 = end1;
  	this.endpoint2 = end2;
  	this.id = i;
  	this.highway = h;
  }

  getLength() : number {
  	return vec2.distance(this.endpoint1.position, this.endpoint2.position);
  }

  getMidpoint() : vec2 {
  	let temp : vec2 = vec2.create();
  	vec2.add(temp, this.endpoint1.position, this.endpoint2.position);
  	return vec2.fromValues(temp[0] / 2, temp[1] / 2);
  }

  getClosestEndpoint(pos: vec2) : Node {
  	let dist1 = vec2.distance(this.endpoint1.position, pos);
  	let dist2 = vec2.distance(this.endpoint2.position, pos);
  	if(dist1 <= dist2) {
  		return this.endpoint1;
  	}
  	return this.endpoint2;
  }

  // Get the direction vector going from point 1 to point 2
  getDirectionVector() : vec2 {
    let dir : vec2 = vec2.create();
    vec2.subtract(dir, this.endpoint2.position, this.endpoint1.position);
    vec2.normalize(dir, dir);
    return dir;
  }

  intersectionEdge(e: Edge) : vec2 {
    // Suppose this edge is defined as x0(t) = u0 + tv0,
    // and the given edge is defined   x1(t) = u1 + tv1,
    // where t exists in the interval [0, 1].
    // u0 = this.endpoint1, v0 = this.endpoint2 - this.endpoint1
    // u1 = e.endpoint1,    v1 = e.endpoint2 - e.endpoint2

    let v0 = vec2.fromValues(this.endpoint2.x - this.endpoint1.x,
                             this.endpoint2.y - this.endpoint1.y);
    let v1 = vec2.fromValues(e.endpoint2.x - e.endpoint1.x,
                             e.endpoint2.y - e.endpoint1.y);
    let x00 = this.endpoint1.x,
        y00 = this.endpoint1.y,
        x01 = v0[0],
        y01 = v0[1],
        x10 = e.endpoint1.x,
        y10 = e.endpoint1.y,
        x11 = v1[0],
        y11 = v1[1];

    if(x00 - x10 == 0 && y00 - y10 == 0) {
      return vec2.fromValues(this.endpoint1.x, this.endpoint1.y);
    }

    let determinant : number = e.endpoint2.x * this.endpoint2.y - this.endpoint2.x * e.endpoint2.y;
    // We're going to handle parallel lines specially, because if two edges overlap in this way we'll
    // stil want a valid intersection returned
    if(determinant == 0) {

      return undefined;
    }

    let s : number = ((x00 - x10) * y01 - (y00 - y10) * x01) / determinant;
    if(s < 0 || s > 1) {
      return undefined;
    }

    let t : number = -((x10 - x00) * y11 + (y00 - y10) * x11) / determinant;
    if(t < 0 || t > 1) {
      return undefined;
    }

    let point : vec2 = vec2.create();
    vec2.scaleAndAdd(point, this.endpoint1.position, this.endpoint2.position, t);
    return point;
  }

  intersectionSegment(p1: vec2, p2: vec2) : vec2 {
    return this.intersectionEdge(new Edge(new Node(p1, -1), new Node(p2, -1),
                                 -1, false));
  }

  // First parameter is bottom left corner,
  // second parameter is top right corner.
  intersectQuad(corner1: vec2, corner2: vec2) : boolean {
    let top : vec2 = this.intersectionSegment(vec2.fromValues(corner1[0], corner2[1]), corner2);
    let left : vec2 = this.intersectionSegment(vec2.fromValues(corner1[0], corner2[1]), corner1);
    let bottom : vec2 = this.intersectionSegment(corner1, vec2.fromValues(corner2[0], corner1[1]));
    let right : vec2 = this.intersectionSegment(corner2, vec2.fromValues(corner2[0], corner1[1]));

    return top != undefined || left != undefined || bottom != undefined || right != undefined;
  }
}