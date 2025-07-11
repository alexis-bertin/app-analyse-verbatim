# Analyseur de Verbatim IA

Une application web Next.js pour analyser automatiquement des verbatim par sentiment et thématique.

## Fonctionnalités

- **Upload CSV** : Importez vos verbatim depuis un fichier CSV
- **Saisie manuelle** : Collez directement vos verbatim dans l'interface
- **Analyse IA simulée** : Classification automatique par sentiment et thématique
- **Visualisations** : Graphiques interactifs (camembert et barres)
- **Export CSV** : Exportez les résultats d'analyse
- **Interface responsive** : Optimisée pour desktop et mobile

## Installation

```bash
npm install
npm run dev
```

## Déploiement Vercel

1. Connectez votre repository GitHub à Vercel
2. Vercel détectera automatiquement Next.js
3. Déployez avec les paramètres par défaut

## Structure du projet

- `app/` : Pages et composants Next.js 13+
- `components/` : Composants React réutilisables
- `lib/` : Utilitaires et logique métier
- `public/` : Assets statiques

## Technologies utilisées

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Recharts (graphiques)
- Papa Parse (CSV)
- Lucide React (icônes)