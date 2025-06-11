export interface CostEntry {
  timestamp: number
  operation: string
  cost: number
  source: 'youtube' | 'podcast' | 'embeddings' | 'ai-response'
  metadata?: any
}

export interface DailyCostSummary {
  date: string
  totalCost: number
  operationCount: number
  operations: { [key: string]: { count: number, cost: number } }
  budgetRemaining: number
  isOverBudget: boolean
}

export class CostMonitor {
  private static instance: CostMonitor
  private costs: CostEntry[] = []
  private readonly dailyBudget = 10.00 // $10/day maximum
  private costSavingMode = false

  static getInstance(): CostMonitor {
    if (!CostMonitor.instance) {
      CostMonitor.instance = new CostMonitor()
    }
    return CostMonitor.instance
  }

  async trackOperation(
    operation: string, 
    cost: number, 
    source: CostEntry['source'] = 'youtube',
    metadata?: any
  ): Promise<void> {
    const entry: CostEntry = {
      timestamp: Date.now(),
      operation,
      cost,
      source,
      metadata
    }

    this.costs.push(entry)
    console.log(`💰 Cost tracked: ${operation} = $${cost.toFixed(4)} (source: ${source})`)

    // Check budget and enable cost saving if needed
    const dailyCost = await this.getCurrentDailyCost()
    if (dailyCost > this.dailyBudget * 0.8) { // 80% threshold
      this.enableCostSavingMode()
    }

    // Alert if budget exceeded
    if (dailyCost > this.dailyBudget) {
      await this.alertIfBudgetExceeded()
    }

    // Cleanup old entries (keep only last 7 days)
    this.cleanupOldEntries()
  }

  async getCurrentDailyCost(): Promise<number> {
    const today = new Date().toDateString()
    const todayEntries = this.costs.filter(entry => 
      new Date(entry.timestamp).toDateString() === today
    )

    return todayEntries.reduce((sum, entry) => sum + entry.cost, 0)
  }

  async getDailySummary(date?: string): Promise<DailyCostSummary> {
    const targetDate = date || new Date().toDateString()
    const dayEntries = this.costs.filter(entry => 
      new Date(entry.timestamp).toDateString() === targetDate
    )

    const totalCost = dayEntries.reduce((sum, entry) => sum + entry.cost, 0)
    const operationCount = dayEntries.length

    // Group by operation type
    const operations: { [key: string]: { count: number, cost: number } } = {}
    dayEntries.forEach(entry => {
      if (!operations[entry.operation]) {
        operations[entry.operation] = { count: 0, cost: 0 }
      }
      operations[entry.operation].count++
      operations[entry.operation].cost += entry.cost
    })

    return {
      date: targetDate,
      totalCost,
      operationCount,
      operations,
      budgetRemaining: Math.max(0, this.dailyBudget - totalCost),
      isOverBudget: totalCost > this.dailyBudget
    }
  }

  async enableCostSavingMode(): Promise<void> {
    if (!this.costSavingMode) {
      this.costSavingMode = true
      console.log(`⚠️ Cost saving mode enabled - daily budget approaching limit`)
    }
  }

  async disableCostSavingMode(): Promise<void> {
    this.costSavingMode = false
    console.log(`✅ Cost saving mode disabled`)
  }

  isCostSavingMode(): boolean {
    return this.costSavingMode
  }

  private async alertIfBudgetExceeded(): Promise<void> {
    const dailyCost = await this.getCurrentDailyCost()
    if (dailyCost > this.dailyBudget) {
      console.error(`🚨 BUDGET EXCEEDED: Daily cost $${dailyCost.toFixed(2)} exceeds budget $${this.dailyBudget.toFixed(2)}`)
      
      // In a production environment, you would:
      // - Send notifications to administrators
      // - Temporarily disable expensive operations
      // - Log to monitoring services
      
      this.enableCostSavingMode()
    }
  }

  private cleanupOldEntries(): void {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
    this.costs = this.costs.filter(entry => entry.timestamp > sevenDaysAgo)
  }

  // Get cost recommendations based on usage patterns
  async getCostOptimizationRecommendations(): Promise<{
    recommendations: string[]
    potentialSavings: number
    riskLevel: 'low' | 'medium' | 'high'
  }> {
    const dailyCost = await this.getCurrentDailyCost()
    const recommendations: string[] = []
    let potentialSavings = 0
    let riskLevel: 'low' | 'medium' | 'high' = 'low'

    // Analyze cost patterns
    const recentEntries = this.costs.slice(-50) // Last 50 operations
    const avgCostPerOp = recentEntries.reduce((sum, e) => sum + e.cost, 0) / recentEntries.length
    
    if (avgCostPerOp > 0.01) {
      recommendations.push('Consider using basic processing tier for simple questions')
      potentialSavings += 0.005
    }

    const youtubeOps = recentEntries.filter(e => e.source === 'youtube')
    if (youtubeOps.length > 20) {
      recommendations.push('High YouTube usage detected - session caching is helping reduce costs')
    }

    const aiResponseOps = recentEntries.filter(e => e.source === 'ai-response')
    if (aiResponseOps.some(op => op.cost > 0.005)) {
      recommendations.push('Some AI responses are expensive - consider shorter context windows')
      potentialSavings += 0.003
    }

    // Determine risk level
    if (dailyCost > this.dailyBudget * 0.9) {
      riskLevel = 'high'
    } else if (dailyCost > this.dailyBudget * 0.7) {
      riskLevel = 'medium'
    }

    return {
      recommendations,
      potentialSavings,
      riskLevel
    }
  }

  // Get cost breakdown by source
  getCostBreakdown(days: number = 1): {
    sources: { [key: string]: number }
    operations: { [key: string]: number }
    timeline: { timestamp: number, cost: number }[]
  } {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000)
    const relevantEntries = this.costs.filter(entry => entry.timestamp > cutoff)

    const sources: { [key: string]: number } = {}
    const operations: { [key: string]: number } = {}

    relevantEntries.forEach(entry => {
      sources[entry.source] = (sources[entry.source] || 0) + entry.cost
      operations[entry.operation] = (operations[entry.operation] || 0) + entry.cost
    })

    const timeline = relevantEntries.map(entry => ({
      timestamp: entry.timestamp,
      cost: entry.cost
    }))

    return { sources, operations, timeline }
  }

  // Export cost data (for analytics/debugging)
  async exportCostData(): Promise<{
    summary: DailyCostSummary
    recentEntries: CostEntry[]
    settings: { dailyBudget: number, costSavingMode: boolean }
  }> {
    return {
      summary: await this.getDailySummary(),
      recentEntries: this.costs.slice(-100), // Last 100 entries
      settings: {
        dailyBudget: this.dailyBudget,
        costSavingMode: this.costSavingMode
      }
    }
  }

  // Reset daily costs (for testing)
  resetDailyCosts(): void {
    const today = new Date().toDateString()
    this.costs = this.costs.filter(entry => 
      new Date(entry.timestamp).toDateString() !== today
    )
    this.disableCostSavingMode()
    console.log(`🔄 Daily costs reset`)
  }
} 