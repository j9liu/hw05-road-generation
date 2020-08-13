#version 300 es
precision highp float;

uniform vec3 u_Eye, u_Ref, u_Up;
uniform vec2 u_Dimensions;

uniform float u_WaterLevel;

in vec2 fs_Pos;
out vec4 out_Col;

/* NOISE FUNCTIONS */

float random(vec2 p, vec2 seed) {
  return fract(sin(dot(p + seed, vec2(127.1f, 311.7f))) * 43758.5453f);
}

float interpNoise2D(float x, float y) {
	int intX = int(floor(x));
	float fractX = fract(x);
	int intY = int(floor(y));
	float fractY = fract(y);

	float v1 = random(vec2(intX, intY), vec2(0.));
	float v2 = random(vec2(intX + 1, intY), vec2(0.));
	float v3 = random(vec2(intX, intY + 1), vec2(0.));
	float v4 = random(vec2(intX + 1, intY + 1), vec2(0.));

	/*float i1 = smoothstep(v1, v2, v1 + (v2 - v1) * fractX);
	if(v1 > v2) {
		i1 = smoothstep(v2, v1, v2 + (v1 - v2) * fractX);
	}*/
	float i1 = mix(v1, v2, fractX);
	float i2 = mix(v3, v4, fractX);
	return mix(i1, i2, fractY);
}

float fbm2(vec2 p) {
	float total = 0.0f;
	float persistence = 0.5f;
	int octaves = 8;

	float freq = .5;
	float amp = 1. / persistence;

	for(int i = 0; i < octaves; i++) {
		freq *= 2.0;
		amp *= persistence;
		total += interpNoise2D(p.x * freq, p.y * freq) * amp;
	}

	return total;
}

#define cell_size 2.f

vec2 generate_point(vec2 cell) {
    vec2 p = vec2(cell.x, cell.y);
    p += fract(sin(vec2(dot(p, vec2(127.1f, 311.7f)), dot(p, vec2(269.5f, 183.3f)) * 43758.5453f)));
    return p * cell_size;
}

float worleyNoise(vec2 pixel) {
    vec2 cell = floor(pixel / cell_size);

    vec2 point = generate_point(cell);

    float shortest_distance = length(pixel - point);

   // compute shortest distance from cell + neighboring cell points

    for(float i = -1.0f; i <= 1.0f; i += 1.0f) {
        float ncell_x = cell.x + i;
        for(float j = -1.0f; j <= 1.0f; j += 1.0f) {
            float ncell_y = cell.y + j;

            // get the point for that cell
            vec2 npoint = generate_point(vec2(ncell_x, ncell_y));

            // compare to previous distances
            float distance = length(pixel - npoint);
            if(distance < shortest_distance) {
                shortest_distance = distance;
            }
        }
    }

    return shortest_distance / cell_size;
}

void main() {
	
	out_Col = vec4(vec3(0.), 1.);

	// Map data to the RGB components of each pixel.
	// Let height correspond with the G value
	// and population with the R value.

	float height = pow(fbm2(2.f * fs_Pos + vec2(1.f, -0.4f)), 5.f);
	float population = 1. - worleyNoise(vec2(1.5, -1.0) + 2. * fs_Pos) * fbm2(fs_Pos + vec2(1.3, -2));

	out_Col.g = height / 5.;
  	out_Col.r = population;
}
