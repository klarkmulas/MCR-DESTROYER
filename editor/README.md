# FORGE3D Studio

Editor 3D web sperimentale integrato nel repository MCR-DESTROYER.

## Versione 0.1

Funzioni già operative:

- Viewport 3D con camera orbitale
- Aggiunta di cubo, sfera, cilindro, cono, piano e toride
- Elementi architettonici rapidi: parete, pavimento, porta, finestra
- Personaggio/manichino 3D di base
- Selezione degli oggetti con mouse o gerarchia
- Sposta / ruota / scala con TransformControls
- Scorciatoie W, E, R
- Elimina con Canc
- Duplica con Ctrl+D
- Undo / redo con Ctrl+Z e Ctrl+Y
- Modifica numerica di posizione, rotazione e scala
- Colore, rugosità, metallo, wireframe e texture
- Importazione GLB, GLTF e OBJ
- Esportazione GLB
- Salvataggio e caricamento locale
- Foto usata come piano di riferimento nella scena
- Interfaccia Foto -> 3D già predisposta per persona, oggetto e stanza

## Foto -> 3D

La UI è presente nella versione 0.1, ma la generazione AI completa deve passare da un backend sicuro.

Non inserire chiavi API direttamente in app.js o in altri file pubblicati su GitHub Pages.

Architettura prevista:

browser -> endpoint backend -> provider Image-to-3D -> file GLB -> editor

Il file GLB restituito dal backend potrà essere caricato automaticamente nell'editor.

## Scorciatoie

- W: sposta
- E: ruota
- R: scala
- F: inquadra selezione
- Canc/Backspace: elimina
- Ctrl+D: duplica
- Ctrl+Z: annulla
- Ctrl+Y: ripeti
- Ctrl+S: salva nel browser
- Esc: deseleziona

## Dipendenze

Three.js 0.186.1 via CDN, senza build step.

L'editor è progettato per funzionare direttamente su GitHub Pages.
