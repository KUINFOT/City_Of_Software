import { Schema, model, InferSchemaType } from 'mongoose';

const certificationSchema = new Schema(
  { name: String, issuer: String, obtainedDate: Date, expiryDate: Date },
  { _id: false }
);

const pastContractSchema = new Schema(
  {
    agencyName: String,
    projectTitle: String,
    contractValueThb: Number,
    year: Number,
    evidenceUrl: String,
  },
  { _id: false }
);

const vendorProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    organizationType: { type: String, enum: ['company', 'freelancer'], required: true },
    companyName: String,
    companyNameEn: String,
    registrationNumber: String,
    companySize: { type: String, enum: ['freelancer', 'small', 'medium', 'large'] },
    foundedYear: Number,

    techStack: [String],
    serviceCategories: [String],
    yearsExperience: { type: Number, min: 0 },
    teamSize: { type: Number, min: 1 },
    certifications: [certificationSchema],
    pastContracts: [pastContractSchema],
    totalContractValueThb: { type: Number, default: 0 },

    interests: {
      projectTypes: [String],
      technologies: [String],
      budgetRange: { minThb: Number, maxThb: Number },
      // Followed agencies (SCRUM-98/99, UC-07) — an explicit watchlist a
      // vendor curates on top of profile-based matching, distinct from
      // techStack/projectTypes above (which describe the vendor's own
      // capabilities, not what they've chosen to track).
      agencyIds: [{ type: Schema.Types.ObjectId, ref: 'Agency' }],
      // Free-text terms a vendor wants matched against a TOR's title,
      // independent of technologies/projectTypes.
      keywords: [String],
    },
    notificationPrefs: {
      channels: { type: [String], default: ['email', 'in_app'] },
      frequency: { type: String, enum: ['instant', 'daily_digest'], default: 'instant' },
      minMatchScore: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

vendorProfileSchema.index({ techStack: 1 });
vendorProfileSchema.index({ 'interests.technologies': 1 });

// Recompute derived total from pastContracts on save.
vendorProfileSchema.pre('save', function () {
  if (this.isModified('pastContracts')) {
    this.totalContractValueThb = this.pastContracts.reduce(
      (sum, c) => sum + (c.contractValueThb || 0),
      0
    );
  }
});

export type VendorProfileDoc = InferSchemaType<typeof vendorProfileSchema>;
export const VendorProfileModel = model('VendorProfile', vendorProfileSchema);
