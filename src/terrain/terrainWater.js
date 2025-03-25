                // Continued from previous fragment shader
                float fresnel = pow(1.0 - max(0.0, dot(normal, normalize(cameraPosition - vPosition))), 5.0);
                
                // Sample caustics
                vec3 caustics = texture2D(causticMap, vUv * causticScale).rgb;
                
                // Calculate foam
                float foam = smoothstep(1.0 - foamAmount, 1.0, flow.x * flow.y);
                
                // Blend colors
                vec3 finalColor = mix(
                    refraction.rgb,
                    reflection.rgb,
                    fresnel * reflectivity
                );
                
                finalColor = mix(
                    finalColor,
                    waterColor,
                    0.3
                );
                
                finalColor += caustics * 0.3;
                finalColor += vec3(foam);
                
                gl_FragColor = vec4(finalColor, transparency);
            }
        `;
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        this.reflectionRenderTarget.dispose();
        this.refractionRenderTarget.dispose();
    }
} 