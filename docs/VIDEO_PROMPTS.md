# Video Prompt Direction

ใช้เอกสารนี้เป็น brief สำหรับ image-to-video generation เท่านั้น ภาพ reference ต้องเป็น source of truth และวัตถุหลักต้องไม่ถูก redesign

## Global lock

```text
Preserve the exact identity, silhouette, facial features, jewelry, clothing colors,
hands, objects, shrine architecture, altar position, incense shape, camera framing,
and sacred decorative details from the reference image. Do not add, remove, morph,
or redesign the main subject. No text regeneration, no logo alteration, no new limbs,
no face change, no costume change, no object duplication, no surreal deformation.
Photorealistic 3D cinematic motion, subtle and respectful, stable geometry, seamless loop.
```

## Welcome / Intro

```text
Image-to-video, vertical 9:16, 4 seconds, use the reference temple entrance exactly.
Start from a slightly distant view, then make a very slow cinematic push-in toward the
ornate temple arch and the central Ganesha shrine. Warm golden light gently travels
across the arch, tiny gold dust particles drift slowly, and a thin layer of incense haze
breathes near the floor. Keep the shrine architecture and deity perfectly stable.
No logo, no new text, no camera shake, no object morphing, no extra people, seamless loop.
```

## Temple walkway

```text
Image-to-video, vertical 9:16, 5 seconds. Preserve the exact red velvet carpet,
flower offerings, curtains, altar, and central deity from the reference. Move the camera
forward slowly along the carpet as if entering the real temple. Add only subtle candle
flicker, soft warm volumetric light, and a few floating dust motes. The central deity and
all important decorations remain fixed and recognizable. No redesign, no new objects,
no text, no people, no fast zoom, no distortion.
```

## Deity portrait

```text
Image-to-video, vertical 9:16, 4 seconds. Preserve the exact deity statue from the
reference with identical face, anatomy, crown, jewelry, hands, lotus, vessel, clothing,
and pose. Add only a very subtle breathing-like light pulse, tiny jewelry glints, and
slow ambient haze. The statue must remain still and respectful; do not animate facial
features or create new limbs. Locked camera, photorealistic 3D material response, loop.
```

## Lucky incense

```text
Image-to-video, vertical 9:16, 8 seconds. Preserve the exact incense stick, ash bowl,
background deity, and composition from the reference. A single small ember ignites at
the top, the ember glows naturally, a delicate translucent smoke plume curls upward,
and the incense burns down very slowly. Reveal a random three-digit result only as a
separate UI layer after the ritual completes; do not generate readable numbers inside
the video. Keep the incense geometry unchanged, no hand, no extra sticks, no text,
no camera shake, no object morphing, seamless loop where possible.
```

## Technical output

- Vertical 9:16 master, 1080 x 1920 preferred
- H.264 MP4 plus WebM when available
- 24 or 30 fps, short loop, no baked-in UI text
- Provide a still-image fallback and poster frame
- Keep the subject inside the mobile safe area; preserve headroom for overlay copy
