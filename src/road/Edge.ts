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

  // Two edges are equal if their endpoints are in the same position, within an 
  // epsilon. The direction of the points does not matter.
  equals(e: Edge, epsilon: number) : boolean {
    // Ask if this edge's endpoints are stored left to right
    let leftToRight : boolean = this.endpoint1[0] <= this.endpoint2[0];

    let end1 : vec2 = e.endpoint1;
    let end2 : vec2 = e.endpoint2;

    if((leftToRight && end1[0] > end2[0]) || (!leftToRight && end1[0] < end2[0])) {
      end1 = e.endpoint2;
      end2 = e.endpoint1;
    }
    
    return Math.abs(this.endpoint1[0] - end1[0]) <= epsilon
        && Math.abs(this.endpoint1[1] - end1[1]) <= epsilon
        && Math.abs(this.endpoint2[0] - end2[0]) <= epsilon
        && Math.abs(this.endpoint2[1] - end2[1]) <= epsilon;
      
  }

  // Check if the given edge intersects with this one.
  // This handles intersections even between parallel edges.
  // The implementation of this is drawn entirely from this page:
  // https://stackoverflow.com/questions/563198/how-do-you-detect-where-two-line-segments-intersect
  // If there is no intersection, the function returns undefined.
  intersectSegment(q1: vec2, q2: vec2) : vec2 {
    let p : vec2 = this.endpoint1;
    let r : vec2 = vec2.create();
    vec2.subtract(r, this.endpoint2, this.endpoint1);
    let q : vec2 = q1;
    let s : vec2 = vec2.create();
    vec2.subtract(s, q2, q1);

    let qp : vec2 = vec2.create();
    vec2.subtract(qp, q, p);

    let qpxr : number = qp[0] * r[1] - qp[1] * r[0];
    let rxs : number = r[0] * s[1] - r[1] * s[0];

    if(Math.abs(rxs) < 0.01) { // r x s = 0

      if(Math.abs(qpxr) < 0.01) { // (q - p) x r = 0

        let qpr : number = qp[0] * r[0] + qp[1] * r[1];
        let rr : number = r[0] * r[0] + r[1] * r[1];
        let sr : number = s[0] * r[0] + s[1] * r[1];

        let t0 : number = qpr / rr;
        let t1 : number = t0 + (sr / rr);

        let first : number = t0;
        let second : number = t1;

        if(sr < 0) {
          first = t1;
          second = t0;
        }

        // test [first, second] for overlap with the interval [0, 1]
        if(first <= 1 && 0 <= second) {
          let result : vec2 = vec2.create();
          if(t0 >= 0 && t0 <= 1) {
            vec2.scaleAndAdd(result, p, r, t0);
          } else {
            vec2.scaleAndAdd(result, p, r, t1);
          }
            return vec2.fromValues(result[0], result[1]);
        } else {
          return undefined;
        }

      } else {
        return undefined;
      }

    } else {

      let qpxs : number = qp[0] * s[1] - qp[1] * s[0];
      
      let u : number = qpxr / rxs;
      let t : number = qpxs / rxs;
      if(t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        let result : vec2 = vec2.create();
        vec2.scaleAndAdd(result, p, r, t);
        return vec2.fromValues(result[0], result[1]);
      }
    }
  }

  intersectEdge(e: Edge) : vec2 {
    return this.intersectSegment(e.endpoint1, e.endpoint2);
  }

  // First parameter is bottom left corner,
  // second parameter is top right corner.
  // For the edge to intersect (be inside) the quad, either two cases must occur:
  // 1. at least one of its endpoints must be within the boundary.
  // 2. at least one of the quad's sides must intersect with the edge.
  intersectQuad(cornerbl: vec2, cornertr: vec2) : boolean {
    if ((this.endpoint1[0] >= cornerbl[0] && this.endpoint1[0] <= cornertr[0]
         && this.endpoint1[1] >= cornerbl[1] && this.endpoint1[1] <= cornertr[1])
     || (this.endpoint2[0] >= cornerbl[0] && this.endpoint2[0] <= cornertr[0]
         && this.endpoint2[1] >= cornerbl[1] && this.endpoint2[1] <= cornertr[1])) {
             return true;
    }

    return this.intersectSegment(cornerbl, vec2.fromValues(cornerbl[0], cornertr[1])) != undefined
           || this.intersectSegment(vec2.fromValues(cornerbl[0], cornertr[1]), cornertr) != undefined
           || this.intersectSegment(cornertr, vec2.fromValues(cornertr[0], cornerbl[1])) != undefined
           || this.intersectSegment(vec2.fromValues(cornertr[0], cornerbl[1]), cornerbl) != undefined;
  }
}