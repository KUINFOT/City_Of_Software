import mongoose from 'mongoose';
import { DocumentModel } from '../models/Document';
import { env } from '../config/env';

const mockDocuments = [
  {
    originalName: 'district-cctv-surveillance.pdf',
    projectTitle: 'District CCTV Surveillance Machine Vision Analysis Engine',
    mimeType: 'application/pdf',
    size: 2456789,
    status: 'open_for_bids' as const,
    datePublished: new Date('2026-08-15'),
    agency: 'Sathon & Pathum Wan District Office',
    budget: '฿ 8,500,000',
    deadline: new Date('2026-10-15'),
    technology: 'AI Video Analytics, Computer Vision, Machine Learning',
    projectType: 'AI Video Analytics',
    extractedText:
      'The project aims to develop an AI-powered video analytics platform for district CCTV infrastructure. The system should detect, classify, and analyze events in real time.',
    summary:
      'AI-powered CCTV analytics platform for detecting and analyzing events across district surveillance cameras.',
    metadata: {
      pageCount: 42,
      confidence: 0.96,
    },
  },

  {
    originalName: 'smart-traffic-management.pdf',
    projectTitle: 'Smart Traffic Management and Optimization Platform',
    mimeType: 'application/pdf',
    size: 3874210,
    status: 'open_for_bids' as const,
    datePublished: new Date('2026-08-22'),
    agency: 'Bangkok Metropolitan Administration',
    budget: '฿ 12,000,000',
    deadline: new Date('2026-10-30'),
    technology: 'IoT, AI, Traffic Analytics, Cloud Computing',
    projectType: 'Smart City',
    extractedText:
      'Development of a centralized smart traffic management platform integrating traffic sensors, CCTV feeds, and real-time analytics.',
    summary:
      'Centralized smart-city platform using IoT and AI to monitor traffic conditions and optimize traffic signals.',
    metadata: {
      pageCount: 68,
      confidence: 0.94,
    },
  },

  {
    originalName: 'municipal-cybersecurity-monitoring.pdf',
    projectTitle: 'Municipal Cybersecurity Monitoring and Threat Detection System',
    mimeType: 'application/pdf',
    size: 1987345,
    status: 'under_review' as const,
    datePublished: new Date('2026-07-30'),
    agency: 'City Information Technology Department',
    budget: '฿ 6,500,000',
    deadline: new Date('2026-09-30'),
    technology: 'Cybersecurity, SIEM, Threat Detection, SOC',
    projectType: 'Cybersecurity',
    extractedText:
      'The project requires a centralized cybersecurity monitoring system capable of collecting security events, detecting threats, and generating alerts.',
    summary:
      'Centralized cybersecurity monitoring and threat detection system for municipal IT infrastructure.',
    metadata: {
      pageCount: 35,
      confidence: 0.98,
    },
  },

  {
    originalName: 'ai-cloud-document-platform.pdf',
    projectTitle: 'AI Cloud Document Processing and Classification Platform',
    mimeType: 'application/pdf',
    size: 5123456,
    status: 'draft_feedback' as const,
    datePublished: new Date('2026-09-01'),
    agency: 'Digital Government Development Agency',
    budget: '฿ 9,750,000',
    deadline: new Date('2026-11-01'),
    technology: 'Generative AI, OCR, Cloud Computing, NLP',
    projectType: 'AI & Cloud',
    extractedText:
      'The platform will provide automated document ingestion, OCR, classification, metadata extraction, and AI-assisted summarization.',
    summary:
      'Cloud-based AI document processing platform supporting OCR, classification, metadata extraction, and summarization.',
    metadata: {
      pageCount: 51,
      confidence: 0.91,
    },
  },

  {
    originalName: 'public-school-management-system.pdf',
    projectTitle: 'Integrated Public School Management Information System',
    mimeType: 'application/pdf',
    size: 3214567,
    status: 'uploaded' as const,
    datePublished: new Date('2026-08-10'),
    agency: 'Bangkok Education Office',
    budget: '฿ 4,200,000',
    deadline: new Date('2026-10-05'),
    technology: 'Web Application, Cloud Database, Data Analytics',
    projectType: 'Education Software',
    extractedText:
      'Development of an integrated information system for managing student records, attendance, academic information, and administrative workflows.',
    summary:
      'Web-based school management platform for student records, attendance, academics, and administration.',
    metadata: {
      pageCount: 29,
      confidence: 0.97,
    },
  },

  {
    originalName: 'municipal-data-lake.pdf',
    projectTitle: 'Municipal Data Lake and Analytics Infrastructure',
    mimeType: 'application/pdf',
    size: 6754321,
    status: 'summarized' as const,
    datePublished: new Date('2026-06-20'),
    agency: 'Bangkok Digital Transformation Office',
    budget: '฿ 15,500,000',
    deadline: new Date('2026-08-31'),
    technology: 'Data Lake, Big Data, Cloud Computing, Business Intelligence',
    projectType: 'Data Infrastructure',
    extractedText:
      'The project involves the design and implementation of a municipal-scale data lake supporting data ingestion, transformation, storage, governance, and analytics.',
    summary:
      'Municipal data lake infrastructure designed to consolidate government datasets and support analytics and business intelligence.',
    metadata: {
      pageCount: 83,
      confidence: 0.95,
    },
  },
];

async function seed() {
  try {
    await mongoose.connect(env.mongodbUri);

    console.log('Connected to MongoDB');

    await DocumentModel.deleteMany({});
    console.log('Cleared existing documents');

    const documents = await DocumentModel.insertMany(mockDocuments);

    console.log(`Inserted ${documents.length} mock documents`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Failed to seed documents:', error);
    process.exit(1);
  }
}

seed();