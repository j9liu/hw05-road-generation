#version 300 es
precision highp float;

uniform vec3 u_Eye, u_Ref, u_Up;
uniform vec2 u_Dimensions;
uniform float u_Time;

uniform sampler2D u_Texture; // The texture to be read from by this shader

in vec2 fs_Pos;
in vec2 fs_UV;
out vec4 out_Col;

void main() {
	vec4 diffuseColor = texture(u_Texture, fs_UV);
	out_Col = diffuseColor;
}
