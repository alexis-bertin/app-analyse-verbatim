'use client'

import { useState, useMemo } from 'react'
import { Upload, FileText, BarChart3, PieChart, Download, Loader2, Filter, Tag, Brain, Database } from 'lucide-react'
import Papa from 'papaparse'
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

interface Verbatim {
  id: string
  text: string
  sentiment: 'positif' | 'négatif' | 'neutre'
  thematique: string
}

interface AnalysisResult {
  verbatims: Verbatim[]
  sentimentStats: { name: string; value: number; color: string }[]
  themeStats: { name: string; value: number }[]
  keywords: { word: string; count: number }[]
}

// Configuration de l'API Hugging Face Space
const API_CONFIG = {
  // Remplacez par l'URL de votre Space Hugging Face
  baseUrl: 'https://your-username-verbatim-analyzer.hf.space',
  endpoints: {
    analyze: '/api/predict'
  }
}

// Mapping des sentiments de l'API vers l'interface
const SENTIMENT_MAPPING = {
  'LABEL_0': 'négatif',
  'LABEL_1': 'neutre', 
  'LABEL_2': 'positif'
}

// Mapping des thématiques avec des noms d'affichage sympas
const THEME_DISPLAY_NAMES = {
  'prise_en_charge': '🩺 Prise en Charge',
  'accueil': '👋 Accueil & Réception',
  'prestation_hoteliere': '🏨 Confort & Logement',
  'sortie': '🚪 Sortie & Suivi',
  'RAS': '✅ Rien à Signaler'
}

const SENTIMENT_COLORS = {
  positif: '#10B981',
  négatif: '#EF4444',
  neutre: '#6B7280'
}

// Mots à exclure de l'analyse des mots-clés
const STOP_WORDS = [
  'le', 'la', 'les', 'un', 'une', 'des', 'ce', 'ces', 'cette', 'de', 'du', 'des',
  'et', 'ou', 'mais', 'donc', 'car', 'ni', 'or', 'avec', 'sans', 'pour', 'par',
  'dans', 'sur', 'sous', 'entre', 'chez', 'vers', 'depuis', 'jusqu', 'pendant',
  'avant', 'après', 'pendant', 'selon', 'malgré', 'sauf', 'excepté', 'hormis',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se',
  'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre',
  'leur', 'nos', 'vos', 'leurs', 'ceci', 'cela', 'ça', 'qui', 'que', 'quoi',
  'où', 'quand', 'comment', 'pourquoi', 'combien', 'quel', 'quelle', 'quels',
  'quelles', 'est', 'sont', 'était', 'étaient', 'être', 'avoir', 'faire', 'dire',
  'voir', 'aller', 'venir', 'pouvoir', 'vouloir', 'devoir', 'savoir', 'falloir',
  'très', 'trop', 'peu', 'assez', 'plus', 'moins', 'bien', 'mal', 'bon', 'mauvais',
  'grand', 'petit', 'nouveau', 'vieux', 'jeune', 'vieux', 'beau', 'laid', 'bon',
  'mauvais', 'bonne', 'mauvaise', 'belles', 'laides', 'bien', 'mal', 'mieux',
  'pire', 'meilleur', 'pire', 'meilleure', 'pire', 'plus', 'moins', 'autant',
  'tellement', 'si', 'tant', 'trop', 'assez', 'peu', 'beaucoup', 'trop', 'très',
  'ne', 'pas', 'non', 'ni', 'aucun', 'nul', 'rien', 'personne', 'jamais',
  'toujours', 'souvent', 'parfois', 'rarement', 'jamais', 'déjà', 'encore',
  'bientôt', 'maintenant', 'aujourd', 'hier', 'demain', 'ici', 'là', 'ailleurs',
  'partout', 'nulle', 'part', 'quelque', 'part', 'n', 'importe', 'où'
]

export default function Home() {
  const [verbatims, setVerbatims] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [trainingData, setTrainingData] = useState<any[]>([])
  const [isTrainingMode, setIsTrainingMode] = useState(false)
  const [isWordSelectionMode, setIsWordSelectionMode] = useState(false)
  const [selectedWords, setSelectedWords] = useState<string[]>([])
  const [showWordTrainingPanel, setShowWordTrainingPanel] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiUrl, setApiUrl] = useState<string>(API_CONFIG.baseUrl)
  
  // États pour les filtres
  const [selectedSentiment, setSelectedSentiment] = useState<string>('all')
  const [selectedTheme, setSelectedTheme] = useState<string>('all')

  // Fonction pour extraire les mots-clés
  const extractKeywords = (texts: string[]): { word: string; count: number }[] => {
    const wordCount: Record<string, number> = {}
    
    texts.forEach(text => {
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remplacer la ponctuation par des espaces
        .split(/\s+/)
        .filter(word => 
          word.length > 2 && 
          !STOP_WORDS.includes(word) &&
          !/^\d+$/.test(word) // Exclure les nombres
        )
      
      words.forEach(word => {
        if (word.length > 2) {
          wordCount[word] = (wordCount[word] || 0) + 1
        }
      })
    })
    
    return Object.entries(wordCount)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20) // Top 20 mots-clés
  }

  // Fonction pour analyser un verbatim via l'API
  const analyzeVerbatimWithAPI = async (text: string, themes: string = 'Accueil, Attente, Soins'): Promise<{ sentiment: Verbatim['sentiment'], thematique: string }> => {
    try {
      const response = await fetch(`${apiUrl}${API_CONFIG.endpoints.analyze}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [text, themes]
        })
      })

      if (!response.ok) {
        throw new Error(`Erreur API: ${response.status}`)
      }

      const result = await response.json()
      
      // Traitement de la réponse de l'API
      const apiResult = result.data[0]
      
      // Mapping du sentiment
      const sentiment = SENTIMENT_MAPPING[apiResult.sentiment as keyof typeof SENTIMENT_MAPPING] || 'neutre'
      
      // Mapping de la thématique
      const thematique = apiResult.theme || 'RAS'
      
      return { 
        sentiment: sentiment as Verbatim['sentiment'], 
        thematique 
      }
    } catch (error) {
      console.error('Erreur lors de l\'analyse:', error)
      setApiError(`Erreur de connexion à l'API: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
      
      // Fallback vers l'analyse locale en cas d'erreur
      return analyzeVerbatimLocal(text)
    }
  }

  // Fonction d'analyse locale (fallback)
  const analyzeVerbatimLocal = (text: string): { sentiment: Verbatim['sentiment'], thematique: string } => {
    const lowerText = text.toLowerCase()
    
    // Analyse simple basée sur des mots-clés
    const positiveWords = ['bon', 'bien', 'excellent', 'parfait', 'satisfait', 'content', 'merci', 'super']
    const negativeWords = ['mauvais', 'mal', 'horrible', 'nul', 'décevant', 'mécontent', 'problème']
    
    const positiveScore = positiveWords.filter(word => lowerText.includes(word)).length
    const negativeScore = negativeWords.filter(word => lowerText.includes(word)).length
    
    let sentiment: Verbatim['sentiment'] = 'neutre'
    if (positiveScore > negativeScore) {
      sentiment = 'positif'
    } else if (negativeScore > positiveScore) {
      sentiment = 'négatif'
    }
    
    // Thématique simple
    const themes = {
      'soins': ['soins', 'médecin', 'infirmier', 'traitement'],
      'accueil': ['accueil', 'réception', 'admission'],
      'confort': ['chambre', 'confort', 'repas']
    }
    
    let bestTheme = 'RAS'
    let maxScore = 0
    
    Object.entries(themes).forEach(([theme, keywords]) => {
      const score = keywords.filter(keyword => lowerText.includes(keyword)).length
      if (score > maxScore) {
        maxScore = score
        bestTheme = theme
      }
    })
    
    return { sentiment, thematique: bestTheme }
  }

  const processVerbatims = async (texts: string[]) => {
    setIsLoading(true)
    setApiError(null)
    
    try {
      const analyzed: Verbatim[] = []
      
      // Traitement séquentiel pour éviter de surcharger l'API
      for (let i = 0; i < texts.length; i++) {
        const text = texts[i].trim()
        if (text.length > 0) {
          const { sentiment, thematique } = await analyzeVerbatimWithAPI(text)
          analyzed.push({
            id: `v_${i}`,
            text,
            sentiment,
            thematique
          })
          
          // Petit délai entre les requêtes
          if (i < texts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
      }
      
      // Calcul des statistiques
      const sentimentCounts = analyzed.reduce((acc, v) => {
        acc[v.sentiment] = (acc[v.sentiment] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      const themeCounts = analyzed.reduce((acc, v) => {
        acc[v.thematique] = (acc[v.thematique] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      const sentimentStats = Object.entries(sentimentCounts).map(([name, value]) => ({
        name,
        value,
        color: SENTIMENT_COLORS[name as keyof typeof SENTIMENT_COLORS]
      }))
      
      const themeStats = Object.entries(themeCounts).map(([name, value]) => ({
        name,
        value
      }))
      
      const keywords = extractKeywords(analyzed.map(v => v.text))
      
      setAnalysisResult({
        verbatims: analyzed,
        sentimentStats,
        themeStats,
        keywords
      })
    } catch (error) {
      console.error('Erreur lors du traitement:', error)
      setApiError('Erreur lors de l\'analyse des verbatims')
    } finally {
      setIsLoading(false)
    }
  }

  // Filtrage des verbatims selon les filtres sélectionnés
  const filteredVerbatims = useMemo(() => {
    if (!analysisResult) return []
    
    return analysisResult.verbatims.filter(verbatim => {
      const sentimentMatch = selectedSentiment === 'all' || verbatim.sentiment === selectedSentiment
      const themeMatch = selectedTheme === 'all' || verbatim.thematique === selectedTheme
      return sentimentMatch && themeMatch
    })
  }, [analysisResult, selectedSentiment, selectedTheme])

  // Réinitialiser les filtres quand on change d'analyse
  const resetFilters = () => {
    setSelectedSentiment('all')
    setSelectedTheme('all')
  }

  // Fonction pour charger les données d'entraînement
  const loadTrainingData = (file: File) => {
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const data = results.data.filter((row: any) => 
          row.polarite && row.verbatim && row.thematiques
        ).map((row: any) => ({
          polarite: row.polarite,
          verbatim: row.verbatim,
          thematiques: row.thematiques.split(',').map((t: string) => t.trim()),
          sous_thematiques: row.sous_thematiques ? row.sous_thematiques.split(',').map((t: string) => t.trim()) : []
        }))
        
        setTrainingData(data)
        setIsTrainingMode(true)
      }
    })
  }

  // Fonction pour sélectionner un mot
  const selectWord = (word: string) => {
    if (isWordSelectionMode) {
      setSelectedWords(prev => [...prev, word])
    }
  }

  // Fonction pour ajouter des mots aux listes d'entraînement
  const addWordsToTraining = (type: 'positive' | 'negative') => {
    if (selectedWords.length === 0) return

    // Cette fonctionnalité n'est plus nécessaire avec l'API
    setSelectedWords([])
    setShowWordTrainingPanel(false)
    alert('Cette fonctionnalité n\'est plus disponible avec l\'API Hugging Face')
  }

  // Fonction pour rendre un texte cliquable
  const renderClickableText = (text: string) => {
    if (!isWordSelectionMode) return text

    const words = text.split(/\s+/)
    return words.map((word, index) => {
      const cleanWord = word.replace(/[^\w]/g, '').toLowerCase()
      const isSelected = selectedWords.includes(cleanWord)
      
      if (cleanWord.length < 3 || STOP_WORDS.includes(cleanWord)) {
        return <span key={index}>{word} </span>
      }

      let bgColor = 'bg-gray-100'
      if (isSelected) bgColor = 'bg-yellow-200'

      return (
        <span
          key={index}
          className={`cursor-pointer hover:bg-blue-200 px-1 rounded ${bgColor} ${isSelected ? 'ring-2 ring-yellow-400' : ''}`}
          onClick={() => selectWord(cleanWord)}
          title="Cliquer pour sélectionner"
        >
          {word}{' '}
        </span>
      )
    })
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'text/csv') {
      if (isTrainingMode) {
        loadTrainingData(file)
      } else {
        Papa.parse(file, {
          header: true,
          complete: (results) => {
            const verbatimTexts = results.data
              .map((row: any) => row.verbatim || row.Verbatim || '')
              .filter((text: string) => text.trim().length > 0)
            
            if (verbatimTexts.length > 0) {
              processVerbatims(verbatimTexts)
            }
          }
        })
      }
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const files = e.dataTransfer.files
    if (files?.[0]?.type === 'text/csv') {
      if (isTrainingMode) {
        loadTrainingData(files[0])
      } else {
        Papa.parse(files[0], {
          header: true,
          complete: (results) => {
            const verbatimTexts = results.data
              .map((row: any) => row.verbatim || row.Verbatim || '')
              .filter((text: string) => text.trim().length > 0)
            
            if (verbatimTexts.length > 0) {
              processVerbatims(verbatimTexts)
            }
          }
        })
      }
    }
  }

  const handleTextAnalysis = () => {
    if (verbatims.trim()) {
      const texts = verbatims.split('\n').filter(t => t.trim().length > 0)
      processVerbatims(texts)
    }
  }

  const exportResults = (format: 'csv' | 'json' | 'excel' = 'csv', filtered: boolean = false) => {
    if (!analysisResult) return
    
    const dataToExport = filtered ? filteredVerbatims : analysisResult.verbatims
    
    if (format === 'csv') {
      const csv = Papa.unparse(dataToExport.map(v => ({
        'Verbatim': v.text,
        'Sentiment': v.sentiment,
        'Thématique': THEME_DISPLAY_NAMES[v.thematique as keyof typeof THEME_DISPLAY_NAMES] || v.thematique,
        'Code Thématique': v.thematique
      })))
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `analyse_verbatims_${filtered ? 'filtres' : 'complet'}.csv`
      link.click()
    } else if (format === 'json') {
      const exportData = {
        metadata: {
          date: new Date().toISOString(),
          totalVerbatims: analysisResult.verbatims.length,
          filteredVerbatims: filtered ? filteredVerbatims.length : analysisResult.verbatims.length,
          filters: filtered ? {
            sentiment: selectedSentiment,
            theme: selectedTheme
          } : null,
          statistics: {
            sentiments: analysisResult.sentimentStats,
            themes: analysisResult.themeStats,
            keywords: analysisResult.keywords
          }
        },
        verbatims: dataToExport.map(v => ({
          id: v.id,
          text: v.text,
          sentiment: v.sentiment,
          thematique: v.thematique,
          thematiqueDisplay: THEME_DISPLAY_NAMES[v.thematique as keyof typeof THEME_DISPLAY_NAMES] || v.thematique
        }))
      }
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `analyse_verbatims_${filtered ? 'filtres' : 'complet'}.json`
      link.click()
    }
  }

  const exportAllData = () => {
    if (!analysisResult) return
    
    // Export complet avec toutes les données
    const allData = {
      metadata: {
        date: new Date().toISOString(),
        totalVerbatims: analysisResult.verbatims.length,
        filters: {
          sentiment: selectedSentiment,
          theme: selectedTheme
        }
      },
      statistics: {
        sentiments: analysisResult.sentimentStats,
        themes: analysisResult.themeStats,
        keywords: analysisResult.keywords
      },
      verbatims: {
        all: analysisResult.verbatims.map(v => ({
          id: v.id,
          text: v.text,
          sentiment: v.sentiment,
          thematique: v.thematique,
          thematiqueDisplay: THEME_DISPLAY_NAMES[v.thematique as keyof typeof THEME_DISPLAY_NAMES] || v.thematique
        })),
        filtered: filteredVerbatims.map(v => ({
          id: v.id,
          text: v.text,
          sentiment: v.sentiment,
          thematique: v.thematique,
          thematiqueDisplay: THEME_DISPLAY_NAMES[v.thematique as keyof typeof THEME_DISPLAY_NAMES] || v.thematique
        }))
      }
    }
    
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `analyse_verbatims_complete_${new Date().toISOString().split('T')[0]}.json`
    link.click()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Analyseur de Verbatim IA
          </h1>
          <p className="text-gray-600">
            Analysez vos verbatim automatiquement par sentiment et thématique
          </p>
          <div className="mt-4 flex justify-center space-x-4">
            <button
              onClick={() => {
                setIsTrainingMode(false)
                setIsWordSelectionMode(false)
                setShowWordTrainingPanel(false)
              }}
              className={`px-4 py-2 rounded-md transition-colors ${
                !isTrainingMode && !isWordSelectionMode
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Mode Analyse
            </button>
            <button
              onClick={() => {
                setIsTrainingMode(true)
                setIsWordSelectionMode(false)
                setShowWordTrainingPanel(false)
              }}
              className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                isTrainingMode 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Brain className="mr-2 h-4 w-4" />
              Mode Entraînement
            </button>
            <button
              onClick={() => {
                setIsWordSelectionMode(!isWordSelectionMode)
                setIsTrainingMode(false)
                setShowWordTrainingPanel(false)
              }}
              className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                isWordSelectionMode 
                  ? 'bg-purple-500 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Tag className="mr-2 h-4 w-4" />
              Mode Sélection Mots
            </button>
          </div>
        </div>

        {!analysisResult && !isTrainingMode && !isWordSelectionMode ? (
          <div className="max-w-4xl mx-auto">
            {/* Configuration de l'API */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center">
                <Brain className="mr-2" />
                Configuration de l'API
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL de l'API Hugging Face Space
                  </label>
                  <input
                    type="url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://your-username-verbatim-analyzer.hf.space"
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Remplacez par l'URL de votre Space Hugging Face déployé
                  </p>
                </div>
                {apiError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-800 text-sm">
                      ⚠️ {apiError}
                    </p>
                    <p className="text-red-600 text-xs mt-1">
                      L'application utilise l'analyse locale en mode fallback
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center">
                <Upload className="mr-2" />
                Import de verbatim
              </h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Upload CSV */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Fichier CSV</h3>
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-sm text-gray-600 mb-2">
                      Glissez-déposez votre fichier CSV ici ou
                    </p>
                    <label className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors">
                      Parcourir
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                      Le fichier doit contenir une colonne "verbatim"
                    </p>
                  </div>
                </div>

                {/* Saisie manuelle */}
                <div>
                  <h3 className="text-lg font-medium mb-3">Saisie manuelle</h3>
                  <textarea
                    value={verbatims}
                    onChange={(e) => setVerbatims(e.target.value)}
                    placeholder="Collez vos verbatim ici, un par ligne..."
                    className="w-full h-32 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleTextAnalysis}
                    disabled={!verbatims.trim() || isLoading}
                    className="mt-3 w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-md transition-colors flex items-center justify-center"
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin mr-2" />
                    ) : (
                      <BarChart3 className="mr-2" />
                    )}
                    Analyser
                  </button>
                </div>
              </div>
            </div>

            {isLoading && (
              <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                <Loader2 className="animate-spin mx-auto h-12 w-12 text-blue-500 mb-4" />
                <p className="text-gray-600">Analyse en cours...</p>
              </div>
            )}
          </div>
        ) : isWordSelectionMode ? (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center">
                <Tag className="mr-2" />
                Mode Sélection de Mots - Affinage de l'Algorithme
              </h2>
              <p className="text-gray-600 mb-6">
                Activez ce mode pour sélectionner des mots dans les verbatims et les ajouter aux listes de mots-clés positifs ou négatifs.
                Cliquez sur les mots dans les verbatims pour les sélectionner, puis utilisez le panneau d'entraînement.
              </p>
              
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                <h3 className="text-lg font-medium text-purple-800 mb-2">Instructions</h3>
                <div className="text-sm text-purple-700 space-y-1">
                  <p>• <strong>Mots verts</strong> : Déjà dans la liste des mots positifs</p>
                  <p>• <strong>Mots rouges</strong> : Déjà dans la liste des mots négatifs</p>
                  <p>• <strong>Mots gris</strong> : Cliquez pour les sélectionner</p>
                  <p>• <strong>Mots jaunes</strong> : Mots sélectionnés en attente</p>
                </div>
              </div>

              {analysisResult && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Verbatims avec Sélection de Mots</h3>
                    <button
                      onClick={() => setShowWordTrainingPanel(!showWordTrainingPanel)}
                      className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-md flex items-center"
                    >
                      <Brain className="mr-2 h-4 w-4" />
                      {showWordTrainingPanel ? 'Masquer' : 'Afficher'} Panneau d'Entraînement
                    </button>
                  </div>

                  {showWordTrainingPanel && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-semibold text-yellow-800 mb-2">Mots Sélectionnés ({selectedWords.length})</h4>
                      {selectedWords.length > 0 ? (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {selectedWords.map((word, index) => (
                            <span key={index} className="bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-sm">
                              {word}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-yellow-700 text-sm">Aucun mot sélectionné. Cliquez sur les mots dans les verbatims ci-dessous.</p>
                      )}
                      
                      {selectedWords.length > 0 && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => addWordsToTraining('positive')}
                            className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                          >
                            ➕ Ajouter aux Mots Positifs
                          </button>
                          <button
                            onClick={() => addWordsToTraining('negative')}
                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                          >
                            ➕ Ajouter aux Mots Négatifs
                          </button>
                          <button
                            onClick={() => setSelectedWords([])}
                            className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                          >
                            🗑️ Effacer Sélection
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full table-auto">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Verbatim</th>
                          <th className="text-left p-2">Sentiment</th>
                          <th className="text-left p-2">Thématique</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVerbatims.map((verbatim) => (
                          <tr key={verbatim.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 max-w-md">
                              {renderClickableText(verbatim.text)}
                            </td>
                            <td className="p-2">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium text-white ${
                                  verbatim.sentiment === 'positif' ? 'bg-green-500' :
                                  verbatim.sentiment === 'négatif' ? 'bg-red-500' : 'bg-gray-500'
                                }`}
                              >
                                {verbatim.sentiment}
                              </span>
                            </td>
                            <td className="p-2">
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {THEME_DISPLAY_NAMES[verbatim.thematique as keyof typeof THEME_DISPLAY_NAMES] || verbatim.thematique}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isTrainingMode ? (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center">
                <Database className="mr-2" />
                Mode Entraînement - Amélioration de l'algorithme
              </h2>
              <p className="text-gray-600 mb-6">
                Importez vos fichiers CSV avec les données d'entraînement pour affiner l'algorithme de classification.
                Les fichiers doivent contenir les colonnes : polarite, verbatim, thematiques, sous_thematiques
              </p>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-3">Fichier CSV d'entraînement</h3>
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      dragActive ? 'border-green-400 bg-green-50' : 'border-gray-300'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <Database className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-sm text-gray-600 mb-2">
                      Glissez-déposez votre fichier CSV d'entraînement ici ou
                    </p>
                    <label className="cursor-pointer bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition-colors">
                      Parcourir
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                      Format attendu : polarite, verbatim, thematiques, sous_thematiques
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-3">Données d'entraînement chargées</h3>
                  {trainingData.length > 0 ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <Database className="h-5 w-5 text-green-600 mr-2" />
                        <span className="font-medium text-green-800">
                          {trainingData.length} verbatims d'entraînement chargés
                        </span>
                      </div>
                      <div className="text-sm text-green-700">
                        <p>• Sentiments : {new Set(trainingData.map(d => d.polarite)).size} types</p>
                        <p>• Thématiques : {new Set(trainingData.flatMap(d => d.thematiques)).size} types</p>
                        <p>• Sous-thématiques : {new Set(trainingData.flatMap(d => d.sous_thematiques)).size} types</p>
                      </div>
                      <button
                        onClick={() => {
                          setTrainingData([])
                          setIsTrainingMode(false)
                        }}
                        className="mt-3 bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                      >
                        Retourner au mode analyse
                      </button>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                      <p className="text-gray-600">Aucune donnée d'entraînement chargée</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Importez un fichier CSV pour commencer l'entraînement
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            {/* Header avec export */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-semibold">Résultats d'analyse</h2>
                  <p className="text-gray-600">
                    {analysisResult?.verbatims.length || 0} verbatim(s) analysé(s)
                  </p>
                </div>
                <div className="flex space-x-3">
                  <div className="relative group">
                    <button
                      onClick={() => exportResults('csv', false)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Exporter
                    </button>
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <div className="py-1">
                        <button
                          onClick={() => exportResults('csv', false)}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          📊 CSV Complet
                        </button>
                        <button
                          onClick={() => exportResults('csv', true)}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          🔍 CSV Filtres
                        </button>
                        <button
                          onClick={() => exportResults('json', false)}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          📄 JSON Complet
                        </button>
                        <button
                          onClick={() => exportResults('json', true)}
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          🔍 JSON Filtres
                        </button>
                        <div className="border-t border-gray-200 my-1"></div>
                        <button
                          onClick={exportAllData}
                          className="block w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
                        >
                          🚀 Export Complet (Tout)
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setAnalysisResult(null)
                      setVerbatims('')
                      resetFilters()
                    }}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md"
                  >
                    Nouvelle analyse
                  </button>
                </div>
              </div>
            </div>

            {/* Filtres */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Filter className="mr-2" />
                Filtres
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filtrer par sentiment
                  </label>
                  <select
                    value={selectedSentiment}
                    onChange={(e) => setSelectedSentiment(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">Tous les sentiments</option>
                    <option value="positif">Positif</option>
                    <option value="négatif">Négatif</option>
                    <option value="neutre">Neutre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filtrer par thématique
                  </label>
                  <select
                    value={selectedTheme}
                    onChange={(e) => setSelectedTheme(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">Toutes les thématiques</option>
                    {analysisResult?.themeStats?.map(themeObj => (
                      <option key={themeObj.name} value={themeObj.name}>
                        {THEME_DISPLAY_NAMES[themeObj.name as keyof typeof THEME_DISPLAY_NAMES] || themeObj.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 text-sm text-gray-600">
                {filteredVerbatims.length} verbatim(s) affiché(s) sur {analysisResult?.verbatims.length || 0} total
              </div>
            </div>

            {/* Graphiques */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Graphique sentiments */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <PieChart className="mr-2" />
                  Répartition des sentiments
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={analysisResult?.sentimentStats || []}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {analysisResult?.sentimentStats?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>

              {/* Graphique thématiques */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <BarChart3 className="mr-2" />
                  Répartition des thématiques
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analysisResult?.themeStats || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Mots-clés les plus présents */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Tag className="mr-2" />
                Mots-clés les plus présents
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {analysisResult?.keywords?.map((keyword, index) => (
                  <div key={keyword.word} className="bg-gray-100 rounded-lg p-3 text-center">
                    <div className="text-lg font-semibold text-gray-800">{keyword.word}</div>
                    <div className="text-sm text-gray-600">{keyword.count} occurrence(s)</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Informations sur les exports */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center">
                <Download className="mr-2 h-4 w-4" />
                Options d'Export Disponibles
              </h4>
              <div className="text-sm text-blue-700 space-y-1">
                <p>• <strong>CSV Complet</strong> : Tous les verbatims avec sentiment et thématique</p>
                <p>• <strong>CSV Filtres</strong> : Seulement les verbatims filtrés actuellement</p>
                <p>• <strong>JSON Complet</strong> : Données structurées avec métadonnées</p>
                <p>• <strong>JSON Filtres</strong> : Données filtrées au format JSON</p>
                <p>• <strong>Export Complet</strong> : Toutes les données + statistiques + verbatims complets et filtrés</p>
              </div>
            </div>

            {/* Tableau des verbatims */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Détail des verbatims</h3>
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Verbatim</th>
                      <th className="text-left p-2">Sentiment</th>
                      <th className="text-left p-2">Thématique</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVerbatims.map((verbatim) => (
                      <tr key={verbatim.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 max-w-md">{verbatim.text}</td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium text-white ${
                              verbatim.sentiment === 'positif' ? 'bg-green-500' :
                              verbatim.sentiment === 'négatif' ? 'bg-red-500' : 'bg-gray-500'
                            }`}
                          >
                            {verbatim.sentiment}
                          </span>
                        </td>
                        <td className="p-2">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {THEME_DISPLAY_NAMES[verbatim.thematique as keyof typeof THEME_DISPLAY_NAMES] || verbatim.thematique}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}