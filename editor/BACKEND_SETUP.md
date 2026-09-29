# FORGE3D - attivazione Foto -> 3D

Il frontend resta pubblicato da GitHub. Il file `api/meshy.js` è una funzione serverless pensata per Vercel e protegge la chiave Meshy.

## 1. Crea la chiave Meshy

Crea una API key dal tuo account Meshy. Non inserirla mai in `editor/app.js`, `ai-bridge.js` o in altri file pubblici del repository.

## 2. Pubblica il repository su Vercel

Importa su Vercel il repository GitHub:

`klarkmulas/MCR-DESTROYER`

Vercel rileverà automaticamente la funzione:

`/api/meshy`

Il sito statico può continuare a essere usato su GitHub Pages. Vercel serve solo come backend sicuro.

## 3. Variabili d'ambiente

In Vercel -> Project -> Settings -> Environment Variables crea:

### MESHY_API_KEY

Valore: la tua chiave API Meshy.

### FORGE3D_ACCESS_KEY

Scegli una password lunga e casuale. Questa password protegge il backend da utilizzi non autorizzati.

Esempio di formato:

`forge3d-una-password-molto-lunga-e-casuale`

Non usare questo esempio come password reale.

### ALLOWED_ORIGIN

Per GitHub Pages:

`https://klarkmulas.github.io`

## 4. Redeploy

Dopo aver aggiunto le variabili, esegui un nuovo deploy su Vercel.

Otterrai un URL simile a:

`https://nome-progetto.vercel.app/api/meshy`

## 5. Collegalo a FORGE3D

Apri:

`https://klarkmulas.github.io/MCR-DESTROYER/editor/`

Poi:

1. Foto -> 3D
2. Nel campo Backend incolla l'URL Vercel terminante con `/api/meshy`
3. Nel campo Chiave accesso inserisci lo stesso valore di `FORGE3D_ACCESS_KEY`
4. Premi Test
5. Se compare "Backend collegato e pronto", carica le fotografie
6. Premi Genera 3D

## Flusso

GitHub Pages -> backend Vercel -> Meshy -> GLB -> FORGE3D

La chiave Meshy rimane esclusivamente sul server.

## Modalità disponibili

- 1 foto: Image to 3D
- 2-4 foto: Multi-Image to 3D
- Persona con 1 foto: richiesta A-pose
- Alta precisione multi-foto: geometria 2K
- Texture PBR
- Import automatico del GLB nella scena

## Nota stanze

La versione attuale genera la stanza come un unico asset/mesh 3D. La separazione automatica di pareti, porte, finestre e singoli mobili sarà un modulo successivo.
