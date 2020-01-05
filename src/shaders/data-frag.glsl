#version 300 es
precision highp float;

uniform vec3 u_Eye, u_Ref, u_Up;
uniform vec2 u_Dimensions;
uniform float u_Time;

uniform float u_ShowElevation;  // True if > 0
uniform float u_ShowPopulation; // True if > 0
uniform float u_WaterLevel;

in vec2 fs_Pos;
out vec4 out_Col;

/* NOISE FUNCTIONS */

float noise(float i) {
	return fract(sin(vec2(203.311f * float(i), float(i) * sin(0.324f + 140.0f * float(i))))).x;
}

float random(vec2 p, vec2 seed) {
  return fract(sin(dot(p + seed, vec2(127.1, 311.7))) * 43758.5453);
}

float interpNoise1D(float x) {
	float intX = floor(x);	
	float fractX = fract(x);

	float v1 = noise(intX);
	float v2 = noise(intX + 1.0f);
	return mix(v1, v2, fractX);
}

float fbm(float x) {
	float total = 0.0f;
	float persistence = 0.5f;
	int octaves = 8;

	for(int i = 0; i < octaves; i++) {
		float freq = pow(2.0f, float(i));
		float amp = pow(persistence, float(i));

		total += interpNoise1D(x * freq) * amp;
	}

	return total;
}

float interpNoise2D(float x, float y) {
	float intX = floor(x);
	float fractX = fract(x);
	float intY = floor(y);
	float fractY = fract(y);

	float v1 = random(vec2(intX, intY), vec2(0));
	float v2 = random(vec2(intX + 1.0f, intY), vec2(0));
	float v3 = random(vec2(intX, intY + 1.0f), vec2(0));
	float v4 = random(vec2(intX + 1.0f, intY + 1.0f), vec2(0));

	float i1 = mix(v1, v2, fractX);
	float i2 = mix(v3, v4, fractX);
	return mix(i1, i2, fractY);
}

float fbm2(vec2 p) {
	float total = 0.0f;
	float persistence = 0.5f;
	int octaves = 8;

	for(int i = 0; i < octaves; i++) {
		float freq = pow(2.0f, float(i));
		float amp = pow(persistence, float(i));
		total += interpNoise2D(p.x * freq, p.y * freq) * amp;
	}

	return total;
}

#define cell_size 2.

vec2 generate_point(vec2 cell) {
    vec2 p = vec2(cell.x, cell.y);
    p += fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)) * 43758.5453)));
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
	
	// Land vs. Water Graph
	float height = pow(fbm2(2.f * fs_Pos + vec2(1., -0.4)), 5.);
	if(height < u_WaterLevel) {
 		out_Col = vec4(vec3(66., 134., 244.) / 255., 1.);
  	} else {
  		out_Col = vec4(1.);
  	}
	
	// Show elevation
	if(u_ShowElevation > 0.) {
		if(height < u_WaterLevel) {
	 		out_Col = vec4(mix(vec3(66., 134., 244.) / 255., vec3(34., 184., 201.) / 255.,
	 					   height + worleyNoise(fs_Pos)), 1.);
		} else if (height < 0.8) {
			out_Col = vec4(vec3(132., 58., 84.) / 255., 1.);
		} else if (height < 1.4) {
			out_Col = vec4(vec3(181., 130., 141.) / 255., 1.);
		} else if (height < 4.7) {
			out_Col = vec4(vec3(239., 225., 230.) / 255., 1.);
		} else {
			out_Col = vec4(1.);
		}
	}

	// Show population density
	if(u_ShowPopulation > 0. && height >= u_WaterLevel) {
		float population = pow(1. - worleyNoise(fs_Pos) * fbm2(2. * fs_Pos + vec2(0.3, 7.0)), 2.);
		if(population < 0.2) {
			out_Col = vec4(mix(out_Col.xyz, vec3(235., 242., 99.) / 255., 0.1), 1.);
		} else if(population < 0.5) {
			out_Col = vec4(mix(out_Col.xyz, vec3(235., 242., 99.) / 255., 0.4), 1.);
		} else if(population < 0.8) {
			out_Col = vec4(mix(out_Col.xyz, vec3(130., 232., 67.) / 255., 0.5), 1.);
		} else {
			out_Col = vec4(mix(out_Col.xyz, vec3(22., 158., 62.) / 255., 0.5), 1.);
		}
	}
	
}
