'use client';

/**
 * Settings Management Component
 * Comprehensive settings interface for workspace and user preferences
 */

import { useState } from 'react';
import { Card } from '../ui/card';

interface SettingsTab {
  id: string;
  label: string;
  icon?: string;
}

const settingsTabs: SettingsTab[] = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Team Members' },
  { id: 'billing', label: 'Billing & Plans' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'api', label: 'API Keys' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'advanced', label: 'Advanced' },
];

export function SettingsManager() {
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    // Save settings
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Manage your workspace settings and preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <Card className="p-2">
            <nav className="space-y-1">
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </Card>
        </div>

        {/* Content */}
        <div className="flex-1">
          <Card className="p-6">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'members' && <MembersSettings />}
            {activeTab === 'billing' && <BillingSettings />}
            {activeTab === 'notifications' && <NotificationSettings />}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'api' && <APIKeysSettings />}
            {activeTab === 'webhooks' && <WebhooksSettings />}
            {activeTab === 'integrations' && <IntegrationsSettings />}
            {activeTab === 'advanced' && <AdvancedSettings />}

            <div className="mt-6 pt-6 border-t flex justify-end space-x-3">
              <button className="px-4 py-2 border rounded hover:bg-gray-50 transition">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function GeneralSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">General Settings</h2>
        <p className="text-sm text-muted-foreground">Basic workspace information</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Workspace Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded"
            placeholder="My Awesome Server"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Workspace Slug</label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded"
            placeholder="my-awesome-server"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Your workspace URL: serverforge.io/my-awesome-server
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            className="w-full px-3 py-2 border rounded"
            rows={3}
            placeholder="Brief description of your server..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Time Zone</label>
          <select className="w-full px-3 py-2 border rounded">
            <option>UTC</option>
            <option>America/New_York</option>
            <option>America/Los_Angeles</option>
            <option>Europe/London</option>
            <option>Asia/Tokyo</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function MembersSettings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Team Members</h2>
          <p className="text-sm text-muted-foreground">Manage who has access to your workspace</p>
        </div>
        <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 transition">
          Invite Member
        </button>
      </div>

      <div className="space-y-2">
        {[
          { name: 'John Doe', email: 'john@example.com', role: 'Owner' },
          { name: 'Jane Smith', email: 'jane@example.com', role: 'Admin' },
          { name: 'Bob Johnson', email: 'bob@example.com', role: 'Staff' },
        ].map((member, index) => (
          <div key={index} className="flex items-center justify-between p-3 border rounded">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                {member.name.charAt(0)}
              </div>
              <div>
                <p className="font-medium">{member.name}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-1 text-xs bg-gray-100 rounded">{member.role}</span>
              <button className="text-sm text-red-600 hover:text-red-700">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Billing & Plans</h2>
        <p className="text-sm text-muted-foreground">Manage your subscription and billing</p>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Current Plan: Free</p>
            <p className="text-sm text-muted-foreground">Next billing date: N/A</p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Upgrade Plan
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-medium mb-3">Usage</h3>
        <div className="space-y-3">
          <UsageBar label="API Requests" used={450} total={1000} unit="requests" />
          <UsageBar label="Storage" used={45} total={100} unit="MB" />
          <UsageBar label="Team Members" used={2} total={2} unit="members" />
        </div>
      </div>
    </div>
  );
}

function NotificationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Notification Preferences</h2>
        <p className="text-sm text-muted-foreground">Choose what notifications you receive</p>
      </div>

      <div className="space-y-4">
        <NotificationToggle
          label="Email Notifications"
          description="Receive email notifications for important updates"
          defaultChecked
        />
        <NotificationToggle
          label="Revenue Alerts"
          description="Get notified when new revenue is added"
          defaultChecked
        />
        <NotificationToggle
          label="Player Incidents"
          description="Alert me when players are flagged"
          defaultChecked
        />
        <NotificationToggle
          label="Staff Applications"
          description="Notify me of new staff applications"
        />
        <NotificationToggle
          label="Marketing Emails"
          description="Receive updates about new features and tips"
        />
      </div>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Security Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account security</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded">
          <div>
            <p className="font-medium">Two-Factor Authentication</p>
            <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
          </div>
          <button className="px-4 py-2 border rounded hover:bg-gray-50">Enable</button>
        </div>

        <div className="flex items-center justify-between p-4 border rounded">
          <div>
            <p className="font-medium">Change Password</p>
            <p className="text-sm text-muted-foreground">Update your password regularly</p>
          </div>
          <button className="px-4 py-2 border rounded hover:bg-gray-50">Change</button>
        </div>

        <div className="flex items-center justify-between p-4 border rounded">
          <div>
            <p className="font-medium">Active Sessions</p>
            <p className="text-sm text-muted-foreground">Manage your active sessions</p>
          </div>
          <button className="px-4 py-2 border rounded hover:bg-gray-50">View</button>
        </div>
      </div>
    </div>
  );
}

function APIKeysSettings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">API Keys</h2>
          <p className="text-sm text-muted-foreground">Manage your API keys for programmatic access</p>
        </div>
        <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90">
          Create API Key
        </button>
      </div>

      <div className="space-y-2">
        <div className="p-4 border rounded">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium">Production API Key</p>
            <button className="text-sm text-red-600 hover:text-red-700">Revoke</button>
          </div>
          <p className="text-sm font-mono text-muted-foreground">sfk_prod_**********************</p>
          <p className="text-xs text-muted-foreground mt-2">Last used: 2 hours ago</p>
        </div>
      </div>
    </div>
  );
}

function WebhooksSettings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Webhooks</h2>
          <p className="text-sm text-muted-foreground">Configure webhooks for real-time events</p>
        </div>
        <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90">
          Add Webhook
        </button>
      </div>

      <div className="text-center py-12 text-muted-foreground">
        No webhooks configured yet
      </div>
    </div>
  );
}

function IntegrationsSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect with third-party services</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <IntegrationCard
          name="Discord"
          description="Send notifications to Discord channels"
          connected={false}
        />
        <IntegrationCard
          name="Slack"
          description="Post updates to Slack workspace"
          connected={false}
        />
        <IntegrationCard
          name="Stripe"
          description="Manage payments and subscriptions"
          connected={true}
        />
        <IntegrationCard
          name="Google Analytics"
          description="Track website analytics"
          connected={false}
        />
      </div>
    </div>
  );
}

function AdvancedSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Advanced Settings</h2>
        <p className="text-sm text-muted-foreground">Advanced configuration options</p>
      </div>

      <div className="space-y-4">
        <div className="p-4 border border-red-200 rounded bg-red-50">
          <h3 className="font-medium text-red-900">Danger Zone</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Export Workspace Data</p>
                <p className="text-sm text-muted-foreground">Download all your data</p>
              </div>
              <button className="px-4 py-2 border border-red-600 text-red-600 rounded hover:bg-red-50">
                Export
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Delete Workspace</p>
                <p className="text-sm text-muted-foreground">Permanently delete this workspace</p>
              </div>
              <button className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageBar({ label, used, total, unit }: {
  label: string;
  used: number;
  total: number;
  unit: string;
}) {
  const percentage = (used / total) * 100;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {used} / {total} {unit}
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${
            percentage > 90 ? 'bg-red-500' : percentage > 70 ? 'bg-yellow-500' : 'bg-green-500'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function NotificationToggle({ label, description, defaultChecked = false }: {
  label: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 border rounded">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <input type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4" />
    </div>
  );
}

function IntegrationCard({ name, description, connected }: {
  name: string;
  description: string;
  connected: boolean;
}) {
  return (
    <div className="p-4 border rounded">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {connected && (
          <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Connected</span>
        )}
      </div>
      <button className={`mt-3 px-4 py-2 rounded text-sm ${
        connected
          ? 'border hover:bg-gray-50'
          : 'bg-primary text-white hover:bg-primary/90'
      }`}>
        {connected ? 'Configure' : 'Connect'}
      </button>
    </div>
  );
}
