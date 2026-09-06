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
    companyName: { type: String, required: true },
    companyNameEn: String,
    registrationNumber: String,
    companySize: { type: String, enum: ['freelancer', 'small', 'medium', 'large'] },
    foundedYear: Number,

    techStack: [String],
    certifications: [certificationSchema],
    pastContracts: [pastContractSchema],
    totalContractValueThb: { type: Number, default: 0 },

    interests: {
      projectTypes: [String],
      technologies: [String],
      budgetRange: { minThb: Number, maxThb: Number },
      agencyIds: [{ type: Schema.Types.ObjectId, ref: 'Agency' }],
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
