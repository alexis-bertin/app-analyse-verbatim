'use client'

import { useState } from 'react'
import { Upload, FileText, BarChart3, PieChart, Download, Loader2 } from 'lucide-react'
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
}

const SENTIMENT_COLORS = {
  positif: '#10B981',
  négatif: '#EF4444',
  neutre: '#6B7280'
}

const THEMES = [
  'Accueil', 'Attente', 'Personnel', 'Douleur', 'Propreté', 
  'Organisation', 'Communication', 'Satisfaction', 'Amélioration'
]

export default function Home() {
  const [verbatims, setVerbatims] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const analyzeVerbatim = (text: string): { sentiment: Verbatim['sentiment'], thematique: string } => {
    const lowerText = text.toLowerCase()
    
    // Analyse de sentiment basée sur des mots-clés
    const positiveKeywords = ['bon', 'bien', 'excellent', 'parfait', 'satisfait', 'content', 'merci', 'super', 'génial', 'agréable', 'efficace', 'rapide', 'professionnel']
    const negativeKeywords = ['mauvais', 'mal', 'horrible', 'nul', 'décevant', 'mécontent', 'problème', 'lent', 'désagréable', 'incompétent', 'erreur', 'retard']
    
    let sentiment: Verbatim['sentiment'] = 'neutre'
    const positiveCount = positiveKeywords.filter(word => lowerText.includes(word)).length
    const negativeCount = negativeKeywords.filter(word => lowerText.includes(word)).length
    
    if (positiveCount > negativeCount) {
      sentiment = 'positif'
    } else if (negativeCount > positiveCount) {
      sentiment = 'négatif'
    }
    
    // Analyse thématique basée sur des mots-clés
    const themeKeywords = {
      'Accueil': ['accueil', 'réception', 'entrée', 'première impression'],
      'Attente': ['attente', 'délai', 'patience', 'temps', 'file'],
      'Personnel': ['personnel', 'équipe', 'médecin', 'infirmière', 'secrétaire'],
      'Douleur': ['douleur', 'mal', 'souffrance', 'inconfort'],
      'Propreté': ['propreté', 'propre', 'sale', 'hygiène', 'nettoyage'],
      'Organisation': ['organisation', 'planification', 'rendez-vous', 'horaire'],
      'Communication': ['communication', 'information', 'explication', 'écoute'],
      'Satisfaction': ['satisfaction', 'recommande', 'qualité', 'service'],
      'Amélioration': ['amélioration', 'suggestion', 'conseil', 'mieux']
    }
    
    let thematique = 'Général'
    let maxMatches = 0
    
    Object.entries(themeKeywords).forEach(([theme, keywords]) => {
      const matches = keywords.filter(keyword => lowerText.includes(keyword)).length
      if (matches > maxMatches) {
        maxMatches = matches
        thematique = theme
      }
    })
    
    return { sentiment, thematique }
  }

  const processVerbatims = async (texts: string[]) => {
    setIsLoading(true)
    
    // Simulation d'un délai d'analyse
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const analyzed: Verbatim[] = texts.map((text, index) => {
      const { sentiment, thematique } = analyzeVerbatim(text)
      return {
        id: `v_${index}`,
        text: text.trim(),
        sentiment,
        thematique
      }
    }).filter(v => v.text.length > 0)
    
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
    
    setAnalysisResult({
      verbatims: analyzed,
      sentimentStats,
      themeStats
    })
    
    setIsLoading(false)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'text/csv') {
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

  const handleTextAnalysis = () => {
    if (verbatims.trim()) {
      const texts = verbatims.split('\n').filter(t => t.trim().length > 0)
      processVerbatims(texts)
    }
  }

  const exportResults = () => {
    if (!analysisResult) return
    
    const csv = Papa.unparse(analysisResult.verbatims.map(v => ({
      'Verbatim': v.text,
      'Sentiment': v.sentiment,
      'Thématique': v.thematique
    })))
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'analyse_verbatims.csv'
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
        </div>

        {!analysisResult ? (
          <div className="max-w-4xl mx-auto">
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
        ) : (
          <div className="max-w-7xl mx-auto">
            {/* Header avec export */}
            <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-semibold">Résultats d'analyse</h2>
                  <p className="text-gray-600">
                    {analysisResult.verbatims.length} verbatim(s) analysé(s)
                  </p>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={exportResults}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exporter CSV
                  </button>
                  <button
                    onClick={() => {
                      setAnalysisResult(null)
                      setVerbatims('')
                    }}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md"
                  >
                    Nouvelle analyse
                  </button>
                </div>
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
                      data={analysisResult.sentimentStats}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {analysisResult.sentimentStats.map((entry, index) => (
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
                  <BarChart data={analysisResult.themeStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
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
                    {analysisResult.verbatims.map((verbatim) => (
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
                            {verbatim.thematique}
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