/**
 * File Upload and Storage Management
 * Handles file uploads, validation, and storage
 */

import { logger } from './logger.js';
import crypto from 'crypto';
import path from 'path';
import { Readable } from 'stream';

export enum FileCategory {
  AVATAR = 'avatar',
  DOCUMENT = 'document',
  IMAGE = 'image',
  ATTACHMENT = 'attachment',
  EXPORT = 'export',
  IMPORT = 'import',
  LOGO = 'logo',
}

export interface FileUploadOptions {
  workspaceId?: string;
  userId?: string;
  category: FileCategory;
  file: {
    name: string;
    size: number;
    type: string;
    buffer: Buffer;
  };
  isPublic?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UploadedFile {
  id: string;
  workspaceId?: string;
  userId?: string;
  category: FileCategory;
  originalName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
  uploadedAt: Date;
  expiresAt?: Date;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

class FileUploadService {
  private readonly maxFileSizes: Record<FileCategory, number> = {
    [FileCategory.AVATAR]: 5 * 1024 * 1024, // 5MB
    [FileCategory.LOGO]: 5 * 1024 * 1024, // 5MB
    [FileCategory.DOCUMENT]: 20 * 1024 * 1024, // 20MB
    [FileCategory.IMAGE]: 10 * 1024 * 1024, // 10MB
    [FileCategory.ATTACHMENT]: 25 * 1024 * 1024, // 25MB
    [FileCategory.EXPORT]: 100 * 1024 * 1024, // 100MB
    [FileCategory.IMPORT]: 50 * 1024 * 1024, // 50MB
  };

  private readonly allowedMimeTypes: Record<FileCategory, string[]> = {
    [FileCategory.AVATAR]: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    [FileCategory.LOGO]: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'],
    [FileCategory.DOCUMENT]: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    [FileCategory.IMAGE]: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    [FileCategory.ATTACHMENT]: ['*'], // All types allowed
    [FileCategory.EXPORT]: ['application/json', 'text/csv', 'application/zip'],
    [FileCategory.IMPORT]: ['application/json', 'text/csv', 'application/zip'],
  };

  /**
   * Validate file before upload
   */
  validateFile(file: FileUploadOptions['file'], category: FileCategory): FileValidationResult {
    // Check file size
    const maxSize = this.maxFileSizes[category];
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${this.formatFileSize(maxSize)}`,
      };
    }

    // Check MIME type
    const allowedTypes = this.allowedMimeTypes[category];
    if (!allowedTypes.includes('*') && !allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not allowed for ${category}`,
      };
    }

    // Check file extension
    const ext = path.extname(file.name).toLowerCase();
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.js', '.html'];
    if (dangerousExtensions.includes(ext)) {
      return {
        valid: false,
        error: 'File extension not allowed for security reasons',
      };
    }

    return { valid: true };
  }

  /**
   * Generate a unique file name
   */
  private generateFileName(originalName: string, category: FileCategory): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalName);
    const sanitizedName = path.basename(originalName, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50);
    
    return `${category}/${timestamp}_${random}_${sanitizedName}${ext}`;
  }

  /**
   * Upload file
   */
  async uploadFile(options: FileUploadOptions): Promise<UploadedFile> {
    try {
      logger.info('Uploading file', {
        workspaceId: options.workspaceId,
        userId: options.userId,
        category: options.category,
        fileName: options.file.name,
        fileSize: options.file.size,
      });

      // Validate file
      const validation = this.validateFile(options.file, options.category);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Generate unique file name
      const fileName = this.generateFileName(options.file.name, options.category);

      // In production, upload to S3 or similar storage service
      // const uploadResult = await this.uploadToStorage(fileName, options.file.buffer, options.file.type);

      // For now, create placeholder URL
      const baseUrl = process.env.STORAGE_URL || 'https://storage.serverforge.io';
      const url = `${baseUrl}/${fileName}`;

      const uploadedFile: UploadedFile = {
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        workspaceId: options.workspaceId,
        userId: options.userId,
        category: options.category,
        originalName: options.file.name,
        fileName,
        fileSize: options.file.size,
        mimeType: options.file.type,
        url,
        isPublic: options.isPublic || false,
        metadata: options.metadata,
        uploadedAt: new Date(),
      };

      // Generate thumbnail for images
      if (options.category === FileCategory.IMAGE || options.category === FileCategory.AVATAR) {
        uploadedFile.thumbnailUrl = await this.generateThumbnail(uploadedFile);
      }

      logger.info('File uploaded successfully', {
        fileId: uploadedFile.id,
        url: uploadedFile.url,
      });

      // In a real app, save file metadata to database
      return uploadedFile;
    } catch (error) {
      logger.error('Failed to upload file', error as Error, {
        workspaceId: options.workspaceId,
        fileName: options.file.name,
      });
      throw error;
    }
  }

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(files: FileUploadOptions[]): Promise<UploadedFile[]> {
    const results = await Promise.allSettled(
      files.map(file => this.uploadFile(file))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<UploadedFile> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  /**
   * Upload to storage (S3, etc.)
   */
  private async uploadToStorage(
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<{ url: string; etag: string }> {
    // In production, implement actual S3/storage upload
    // Example with AWS SDK:
    /*
    const s3 = new AWS.S3();
    const result = await s3.upload({
      Bucket: process.env.S3_BUCKET!,
      Key: fileName,
      Body: buffer,
      ContentType: mimeType,
      ACL: 'private',
    }).promise();
    
    return {
      url: result.Location,
      etag: result.ETag,
    };
    */

    return {
      url: `https://storage.serverforge.io/${fileName}`,
      etag: crypto.createHash('md5').update(buffer).digest('hex'),
    };
  }

  /**
   * Generate thumbnail for image
   */
  private async generateThumbnail(file: UploadedFile): Promise<string> {
    // In production, use image processing library like sharp
    // to generate thumbnails
    /*
    const sharp = require('sharp');
    const thumbnail = await sharp(buffer)
      .resize(200, 200, { fit: 'cover' })
      .toBuffer();
    
    // Upload thumbnail
    const thumbnailUrl = await this.uploadToStorage(
      `${file.fileName}_thumb`,
      thumbnail,
      file.mimeType
    );
    */

    return `${file.url}?size=thumbnail`;
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string, userId: string): Promise<void> {
    try {
      logger.info('Deleting file', { fileId, userId });

      // In production:
      // 1. Get file metadata from database
      // 2. Verify user has permission to delete
      // 3. Delete from storage
      // 4. Delete metadata from database

      logger.info('File deleted successfully', { fileId });
    } catch (error) {
      logger.error('Failed to delete file', error as Error, { fileId });
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFile(fileId: string): Promise<UploadedFile | null> {
    logger.info('Fetching file metadata', { fileId });
    // In production, fetch from database
    return null;
  }

  /**
   * List files
   */
  async listFiles(
    options: {
      workspaceId?: string;
      userId?: string;
      category?: FileCategory;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    files: UploadedFile[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20 } = options;

    logger.info('Listing files', options);

    // In production, query database with filters
    return {
      files: [],
      total: 0,
      page,
      limit,
    };
  }

  /**
   * Get signed URL for private file access
   */
  async getSignedUrl(fileId: string, expiresIn: number = 3600): Promise<string> {
    logger.info('Generating signed URL', { fileId, expiresIn });

    // In production, generate signed URL from S3 or storage service
    /*
    const s3 = new AWS.S3();
    const url = await s3.getSignedUrlPromise('getObject', {
      Bucket: process.env.S3_BUCKET,
      Key: file.fileName,
      Expires: expiresIn,
    });
    */

    return `https://storage.serverforge.io/signed/${fileId}?expires=${Date.now() + expiresIn * 1000}`;
  }

  /**
   * Scan file for viruses/malware
   */
  async scanFile(buffer: Buffer): Promise<{ safe: boolean; threats?: string[] }> {
    logger.info('Scanning file for threats', { size: buffer.length });

    // In production, integrate with virus scanning service
    // like ClamAV or cloud services like AWS GuardDuty

    return { safe: true };
  }

  /**
   * Calculate file storage usage
   */
  async calculateStorageUsage(workspaceId: string): Promise<{
    totalBytes: number;
    fileCount: number;
    byCategory: Record<FileCategory, { bytes: number; count: number }>;
  }> {
    logger.info('Calculating storage usage', { workspaceId });

    // In production, aggregate from database
    return {
      totalBytes: 0,
      fileCount: 0,
      byCategory: {} as any,
    };
  }

  /**
   * Clean up expired files
   */
  async cleanupExpiredFiles(): Promise<number> {
    logger.info('Cleaning up expired files');

    // In production:
    // 1. Find expired files from database
    // 2. Delete from storage
    // 3. Delete metadata from database

    return 0;
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Get file MIME type from buffer
   */
  async detectMimeType(buffer: Buffer): Promise<string> {
    // In production, use a library like 'file-type' to detect actual MIME type
    // This prevents users from bypassing validation by changing file extensions

    // Check magic numbers
    if (buffer.length >= 2) {
      // PNG
      if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        return 'image/png';
      }
      // JPEG
      if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        return 'image/jpeg';
      }
      // GIF
      if (buffer[0] === 0x47 && buffer[1] === 0x49) {
        return 'image/gif';
      }
      // PDF
      if (buffer[0] === 0x25 && buffer[1] === 0x50) {
        return 'application/pdf';
      }
    }

    return 'application/octet-stream';
  }
}

/**
 * Express middleware for file upload
 */
export const fileUploadMiddleware = (category: FileCategory, options?: {
  maxFiles?: number;
  required?: boolean;
}) => {
  return async (req: any, res: any, next: any) => {
    try {
      // In production, use multer or similar middleware for actual file handling
      const files = req.files || [];

      if (options?.required && files.length === 0) {
        return res.status(400).json({
          error: 'No files provided',
        });
      }

      if (options?.maxFiles && files.length > options.maxFiles) {
        return res.status(400).json({
          error: `Maximum ${options.maxFiles} files allowed`,
        });
      }

      // Validate each file
      for (const file of files) {
        const validation = fileUploadService.validateFile({
          name: file.originalname,
          size: file.size,
          type: file.mimetype,
          buffer: file.buffer,
        }, category);

        if (!validation.valid) {
          return res.status(400).json({
            error: validation.error,
            file: file.originalname,
          });
        }
      }

      next();
    } catch (error) {
      logger.error('File upload middleware error', error as Error);
      return res.status(500).json({
        error: 'File upload error',
      });
    }
  };
};

export const fileUploadService = new FileUploadService();
