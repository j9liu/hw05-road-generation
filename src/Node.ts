import {vec2} from 'gl-matrix';
import Edge from './Edge'

export default class Node {
  position: vec2 = vec2.create();
  x: number;
  y: number;
  id: number;

  constructor(pos: vec2, i: number) {
    vec2.copy(this.position, pos);
    this.x = this.position[0];
    this.y = this.position[1];
    this.id = i;
  }


  distanceFrom(pos: vec2) {
    return vec2.distance(this.position, pos);
  }

}