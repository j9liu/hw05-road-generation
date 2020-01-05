import {vec2} from 'gl-matrix';
import Edge from './Edge'

export default class Node {
  x: number;
  y: number;
  id: number;

  constructor(pos: vec2, i: number) {
    this.x = pos[0];
    this.y = pos[1];
    this.id = i;
  }

  getPosition() : vec2 {
    return vec2.fromValues(this.x, this.y);
  }

  changePosition(pos: vec2) {
    this.x = pos[0];
    this.y = pos[1];
  }

  equals(n: Node, epsilon: number) : boolean {
    return Math.abs(this.x - n.x) < epsilon
        && Math.abs(this.y - n.y) < epsilon;
  }

  distanceFrom(pos: vec2) {
    return vec2.distance(vec2.fromValues(this.x, this.y), pos);
  }

}