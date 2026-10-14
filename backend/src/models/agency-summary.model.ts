export interface AgencySummary {
    agency: string;
    service: string;
    country: string;
    date: string;
    totalVolume: number;
    recordCount: number;
}

export interface AgencySummarySaveRequest {
    summary: AgencySummary[];
    timestamp: string;
} 