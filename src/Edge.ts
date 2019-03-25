import {vec2} from 'gl-matrix';
import Node from './Node'

export default class Edge {
  endpoint1 : vec2 = vec2.create();
  endpoint2 : vec2 = vec2.create();
  id : number;
  highway : boolean;

  constructor(end1: vec2, end2: vec2, i: number, h: boolean) {
  	vec2.copy(this.endpoint1, end1);
    vec2.copy(this.endpoint2, end2);
  	this.id = i;
  	this.highway = h;
  }

  getLength() : number {
  	return vec2.distance(this.endpoint1, this.endpoint2);
  }

  getMidpoint() : vec2 {
  	let temp : vec2 = vec2.create();
  	vec2.add(temp, this.endpoint1, this.endpoint2);
  	return vec2.fromValues(temp[0] / 2, temp[1] / 2);
  }

  getClosestEndpoint(pos: vec2) : vec2 {
  	let dist1 = vec2.distance(this.endpoint1, pos);
  	let dist2 = vec2.distance(this.endpoint2, pos);
  	if(dist1 <= dist2) {
  		return this.endpoint1;
  	}
  	return this.endpoint2;
  }

  // Get the direction vector going from point 1 to point 2
  getDirectionVector() : vec2 {
    let dir : vec2 = vec2.create();
    vec2.subtract(dir, this.endpoint2, this.endpoint1);
    vec2.normalize(dir, dir);
    return dir;
  }

  intersectionEdge(e: Edge) : vec2 {
    // Suppose this edge is defined as x0(t) = u0 + tv0,
    // and the given edge is defined   x1(t) = u1 + tv1,
    // where t exists in the interval [0, 1].
    // u0 = this.endpoint1, v0 = this.endpoint2 - this.endpoint1
    // u1 = e.endpoint1,    v1 = e.endpoint2 - e.endpoint2

    let v0 = vec2.fromValues(this.endpoint2[0] - this.endpoint1[0],
                             this.endpoint2[1] - this.endpoint1[1]);
    let v1 = vec2.fromValues(e.endpoint2[0] - e.endpoint1[0],
                             e.endpoint2[1] - e.endpoint1[1]);
    let x00 = this.endpoint1[0],
        y00 = this.endpoint1[1],
        x01 = v0[0],
        y01 = v0[1],
        x10 = e.endpoint1[0],
        y10 = e.endpoint1[1],
        x11 = v1[0],
        y11 = v1[1];

    if(x00 - x10 == 0 && y00 - y10 == 0) {
      return vec2.fromValues(this.endpoint1[0], this.endpoint1[1]);
    }

    let determinant : number = e.endpoint2[0] * this.endpoint2[1] - this.endpoint2[0] * e.endpoint2[1];
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
    vec2.scaleAndAdd(point, this.endpoint1, this.endpoint2, t);
    return point;
  }

  intersectionSegment(p1: vec2, p2: vec2) : vec2 {
    return this.intersectionEdge(new Edge(p1, p2, -1, false));
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