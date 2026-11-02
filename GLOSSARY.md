# Glossary

Names for the parts of the domain and the code that carry them. Add a term when you name a module after a concept that isn't here yet.

## Maps

- **Ledger Map**: the homepage map of every venue the filters match (`LunchMap.vue`).
- **Ledger Map scene**: the module that decides what the Ledger Map shows (single pins, clusters, a fan-out, the selected venue pulled out of its cluster, names, walking-ring labels, framing), with no Leaflet (`src/lib/map/scene.ts`). Events go in, a frame comes out; `LunchMap.vue` draws the frame.
- **Base**: Lunch Club HQ in Spinningfields, the centre of the walking rings and of every distance.
- **Cluster**: venues whose markers would touch at the current zoom, drawn as one marker.
- **Fan-out**: a cluster that can't split by zooming (venues in one building), its pins spread on a circle around it.
- **Pin layer**: the module both maps draw venue pins through: kept between redraws, activated by tap, Enter or Space, the selected one marked (`src/lib/map/pin-layer.ts`).
- **Near Me**: the full-screen map that ranks venues by distance from the visitor.
