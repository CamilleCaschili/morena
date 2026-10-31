<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ move: [x: number, y: number] }>()
const base = ref<HTMLDivElement | null>(null)
const bouton = ref({ x: 0, y: 0 })
let id: number | null = null
const RAYON = 44

function maj(e: PointerEvent) {
  const r = base.value!.getBoundingClientRect()
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
  const d = Math.hypot(dx, dy)
  if (d > RAYON) { dx *= RAYON / d; dy *= RAYON / d }
  bouton.value = { x: dx, y: dy }
  emit('move', dx / RAYON, -dy / RAYON)
}
function down(e: PointerEvent) { id = e.pointerId; base.value!.setPointerCapture(e.pointerId); maj(e) }
function move(e: PointerEvent) { if (e.pointerId === id) maj(e) }
function up(e: PointerEvent) { if (e.pointerId !== id) return; id = null; bouton.value = { x: 0, y: 0 }; emit('move', 0, 0) }
</script>

<template>
  <div ref="base" class="joy" role="application" aria-label="Joystick de déplacement"
       @pointerdown.prevent="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <div class="bouton" :style="{ transform: `translate(${bouton.x}px, ${bouton.y}px)` }"></div>
  </div>
</template>

<style scoped>
.joy { position: absolute; left: 18px; bottom: 40px; width: 120px; height: 120px; border-radius: 50%; background: rgba(20,24,28,.35); border: 2px solid rgba(255,255,255,.5); touch-action: none; display: grid; place-items: center }
.bouton { width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,.85); box-shadow: 0 2px 8px rgba(0,0,0,.35) }
</style>
