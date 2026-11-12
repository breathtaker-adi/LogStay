// src/app/team.tsx
// Team & Access — Apple HIG Dedicated Staff Management Screen
// Features: Hierarchical Join Code generation, direct link sharing,
// displays ALL positions (Owner, Co-Admin, Front Desk, Housekeeper),
// strict removal hierarchy (Owner supreme; Co-Admin by Owner only; Desk by Owner/Co-Admin; Housekeeper by anyone),
// and historical staff remarks ledger.

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Share,
  TextInput,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { supabase } from "@/lib/supabase";
import { useStaff } from "@/lib/staff-context";
import { ScreenHeader } from "@/lib/screen-header";
import { formatFriendlyError } from "@/lib/error-utils";
import { useTheme } from "@/hooks/use-theme";
import { TeamService, AuthService } from "@/services";
import { StaffRole, TeamMember, StaffRemark } from "@/types";

export default function TeamAccessScreen() {
  const theme = useTheme();
  const { activeStaff } = useStaff();
  const isOwner = activeStaff?.role === 'owner';
  const isCoAdmin = activeStaff?.role === 'co_admin';
  const isDesk = activeStaff?.role === 'desk';
  const canManage = isOwner || isCoAdmin;

  const [propertyId, setPropertyId] = useState("");
  const [staffList, setStaffList] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite code generation state
  const allowedPositions: { id: StaffRole; label: string; icon: string }[] = canManage
    ? [
        { id: 'desk', label: 'Front Desk', icon: 'desktop-outline' },
        { id: 'co_admin', label: 'Co-Admin', icon: 'shield-outline' },
        { id: 'housekeeping', label: 'Housekeeper', icon: 'bed-outline' },
      ]
    : isDesk
    ? [
        { id: 'housekeeping', label: 'Housekeeper', icon: 'bed-outline' },
      ]
    : [];

  const [selectedPosition, setSelectedPosition] = useState<StaffRole>(
    canManage ? 'desk' : 'housekeeping'
  );
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [invitePosition, setInvitePosition] = useState<string>('desk');
  const [generating, setGenerating] = useState(false);

  // Member details / Removal Modal state
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [memberRemarks, setMemberRemarks] = useState<StaffRemark[]>([]);
  const [loadingRemarks, setLoadingRemarks] = useState(false);
  const [removalRemark, setRemovalRemark] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // Change Role Modal state
  const [changeRoleVisible, setChangeRoleVisible] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState<StaffRole>('desk');

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const user = await AuthService.getCurrentUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('members')
        .select('property_id')
        .eq('user_id', user.id)
        .single();

      if (!member?.property_id) return;
      setPropertyId(member.property_id);

      const team = await TeamService.getPropertyTeam(member.property_id);
      setStaffList(team);
    } catch (err) {
      console.error("Error fetching team", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTeam();
    }, [])
  );

  // Generate Invite Code for selected position
  const handleGenerateInvite = async () => {
    if (!canManage && !isDesk) return;
    setGenerating(true);
    try {
      const code = await TeamService.generateInviteCode(
        propertyId,
        activeStaff?.id || null,
        selectedPosition
      );
      setInviteCode(code);
      setInvitePosition(selectedPosition);
    } catch (e: any) {
      Alert.alert('Error', formatFriendlyError(e, 'Failed to generate code.'));
    } finally {
      setGenerating(false);
    }
  };

  // Direct Link Sharing: generates https://logstay.app/join?code=XYZ
  const handleShareCode = async () => {
    if (!inviteCode) return;
    const directLink = TeamService.getDirectJoinLink(inviteCode);
    const roleName = formatRoleLabel(invitePosition as StaffRole);
    try {
      await Share.share({
        title: `Join LogStay Property Team as ${roleName}`,
        message: `Connect directly to our LogStay property team as ${roleName}:\n${directLink}\n\nPass Code: ${inviteCode}\n(Valid for 48 hours • Instant direct authorization)`,
        url: directLink
      });
    } catch (e) {
      console.error('Share error', e);
    }
  };

  // Direct Link Copy to Clipboard
  const handleCopyLink = async () => {
    if (!inviteCode) return;
    const directLink = TeamService.getDirectJoinLink(inviteCode);
    await Clipboard.setStringAsync(directLink);
    Alert.alert('Link Copied', `Direct connection link copied to clipboard:\n${directLink}`);
  };

  const formatRoleLabel = (role: StaffRole | string) => {
    switch (role) {
      case 'owner': return 'Owner';
      case 'co_admin': return 'Co-Admin';
      case 'desk': return 'Front Desk';
      case 'housekeeping': return 'Housekeeper';
      default: return role;
    }
  };

  // Check removal permissions according to strict hierarchy:
  // - Owner is SUPREME (cannot be removed by anyone).
  // - Co-Admin can be removed by Owner only.
  // - Front Desk can be removed by Owner & Co-Admin.
  // - Housekeeper can be removed by anyone (Owner, Co-Admin, Front Desk).
  // - Cannot remove self.
  const canRemoveMember = (target: TeamMember) => {
    return TeamService.canRemoveTarget(
      (activeStaff?.role as StaffRole) || 'desk',
      target.role,
      target.id === activeStaff?.id
    );
  };

  // Open Member Profile & Remarks Details
  const handleOpenMemberDetails = async (member: TeamMember) => {
    setSelectedMember(member);
    setRemovalRemark('');
    setDetailModalVisible(true);
    setLoadingRemarks(true);

    try {
      const remarks = await TeamService.lookupRemarks(member.id);
      setMemberRemarks(remarks);
    } catch (err) {
      console.warn("Could not load member remarks", err);
      setMemberRemarks([]);
    } finally {
      setLoadingRemarks(false);
    }
  };

  // Disconnect / Remove Member with strict hierarchy & optional remark
  const handleConfirmRemoval = async () => {
    if (!selectedMember) return;
    setActionSubmitting(true);

    try {
      await TeamService.removeMember(propertyId, selectedMember.id, removalRemark);

      Alert.alert(
        'Member Disconnected',
        `${selectedMember.name} has been disconnected from the property team.`
      );
      setDetailModalVisible(false);
      setSelectedMember(null);
      setRemovalRemark('');
      await fetchTeam();
    } catch (err: any) {
      Alert.alert('Action Failed', formatFriendlyError(err, 'Could not remove member.'));
    } finally {
      setActionSubmitting(false);
    }
  };

  // Update Role (Owner & Co-Admin only)
  const handleUpdateRole = async () => {
    if (!selectedMember) return;
    setActionSubmitting(true);

    try {
      const { error } = await supabase.rpc('update_staff_role', {
        p_prop: propertyId,
        p_actor: activeStaff?.id || null,
        p_target: selectedMember.id,
        p_new_role: newRoleInput,
      });

      if (error) throw error;

      Alert.alert('Role Updated', `${selectedMember.name} is now assigned as ${formatRoleLabel(newRoleInput)}.`);
      setChangeRoleVisible(false);
      setDetailModalVisible(false);
      await fetchTeam();
    } catch (err: any) {
      Alert.alert('Update Failed', formatFriendlyError(err, 'Could not update role.'));
    } finally {
      setActionSubmitting(false);
    }
  };

  const activeMembers = staffList.filter(s => s.active);
  const pendingMembers = staffList.filter(s => !s.active);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Team & Access"
        subtitle={`${activeMembers.length} active members`}
        showBack={true}
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading team members...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
          {/* ── STEP 1 & 2: GENERATE MEMBER JOIN CODE BY POSITION ────── */}
          {allowedPositions.length > 0 && (
            <View style={[styles.codeGenCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.codeGenHeaderRow}>
                <View style={[styles.codeIconBox, { backgroundColor: theme.surfaceSubtle }]}>
                  <Ionicons name="key" size={20} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.codeGenTitle, { color: theme.text }]}>Add Member via Join Code</Text>
                  <Text style={[styles.codeGenSub, { color: theme.textSecondary }]}>
                    {canManage
                      ? "Select the position to add, then generate a 48-hour pass code or direct link."
                      : "Front desk staff can invite new Housekeepers to the team."}
                  </Text>
                </View>
              </View>

              {/* Position Selector */}
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>SELECT POSITION</Text>
              <View style={styles.positionGrid}>
                {allowedPositions.map((pos) => {
                  const isSelected = selectedPosition === pos.id;
                  return (
                    <TouchableOpacity
                      key={pos.id}
                      style={[
                        styles.positionChip,
                        { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceSubtle },
                        isSelected && { backgroundColor: theme.accent, borderColor: theme.accent }
                      ]}
                      onPress={() => setSelectedPosition(pos.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={pos.icon as any}
                        size={16}
                        color={isSelected ? '#ffffff' : theme.text}
                      />
                      <Text style={[
                        styles.positionChipText,
                        { color: theme.text },
                        isSelected && { color: '#ffffff', fontWeight: '700' }
                      ]}>
                        {pos.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Generate Button */}
              <TouchableOpacity
                style={[styles.generateBtn, { backgroundColor: theme.accent }]}
                onPress={handleGenerateInvite}
                disabled={generating}
                activeOpacity={0.8}
              >
                {generating ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color="#ffffff" />
                    <Text style={styles.generateBtnText}>
                      Generate Code for {formatRoleLabel(selectedPosition)}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* ── Apple HIG Resulting Code Box with Direct Link Sharing ── */}
              {inviteCode && (
                <View style={[styles.codeResultCard, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                  <View style={styles.codeResultTopRow}>
                    <View style={[styles.roleTagPill, { backgroundColor: theme.accentSubtle }]}>
                      <Text style={[styles.roleTagText, { color: theme.accent }]}>
                        {formatRoleLabel(invitePosition).toUpperCase()} PASS
                      </Text>
                    </View>
                    <Text style={[styles.validityBadge, { color: theme.textTertiary }]}>48h Expiry</Text>
                  </View>

                  <Text style={[styles.codeResultText, { color: theme.text }]}>{inviteCode}</Text>

                  <Text style={[styles.codeResultHelp, { color: theme.textSecondary }]}>
                    Recipient connects instantly to the Home Screen • No PIN setup required.
                  </Text>

                  {/* Dual Action Buttons: Copy Link & Share Link */}
                  <View style={styles.codeActionRow}>
                    <TouchableOpacity
                      style={[styles.codeActionPill, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      onPress={handleCopyLink}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="copy-outline" size={16} color={theme.text} />
                      <Text style={[styles.codeActionText, { color: theme.text }]}>Copy Link</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.codeActionPillPrimary, { backgroundColor: theme.accent }]}
                      onPress={handleShareCode}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="share-social-outline" size={16} color="#ffffff" />
                      <Text style={styles.codeActionTextPrimary}>Share Direct Link</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Pending / Inactive Members (if any exist) */}
          {pendingMembers.length > 0 && (
            <View style={[styles.pendingCard, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}>
              <View style={styles.pendingHeaderRow}>
                <Ionicons name="time-outline" size={18} color={theme.textSecondary} />
                <Text style={[styles.pendingTitle, { color: theme.textSecondary }]}>
                  PREVIOUS / INACTIVE MEMBERS ({pendingMembers.length})
                </Text>
              </View>

              {pendingMembers.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.pendingItemRow, { borderTopColor: theme.borderSubtle }]}
                  onPress={() => handleOpenMemberDetails(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.memberLeft}>
                    <View style={[styles.avatarBox, { backgroundColor: theme.surface }]}>
                      <Text style={[styles.avatarText, { color: theme.textSecondary }]}>
                        {item.name ? item.name.charAt(0).toUpperCase() : 'U'}
                      </Text>
                    </View>
                    <View>
                      <Text style={[styles.memberName, { color: theme.textSecondary }]}>{item.name}</Text>
                      <Text style={[styles.memberSub, { color: theme.textTertiary }]}>
                        {formatRoleLabel(item.role)} • Inactive
                      </Text>
                    </View>
                  </View>

                  <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── ACTIVE TEAM MEMBERS — Shows ALL positions (Owner, Co-Admin, Front Desk, Housekeeper) ── */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.groupHeader, { color: theme.textSecondary }]}>ACTIVE TEAM MEMBERS</Text>
            <Text style={[styles.groupCounter, { color: theme.textTertiary }]}>{activeMembers.length} on duty</Text>
          </View>

          <View style={[styles.groupedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {activeMembers.map((item, index) => {
              const isLast = index === activeMembers.length - 1;
              const isItemOwner = item.role === 'owner';
              const isItemCoAdmin = item.role === 'co_admin';
              const isItemHousekeeping = item.role === 'housekeeping';

              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.memberRow,
                    !isLast && { borderBottomColor: theme.borderSubtle },
                    pressed && { backgroundColor: theme.surfaceSubtle }
                  ]}
                  onPress={() => handleOpenMemberDetails(item)}
                >
                  <View style={styles.memberLeft}>
                    <View style={[
                      styles.avatarBox,
                      isItemOwner
                        ? { backgroundColor: '#FEF3C7' }
                        : isItemCoAdmin
                        ? { backgroundColor: theme.accentSubtle }
                        : isItemHousekeeping
                        ? { backgroundColor: theme.dirtySubtle }
                        : { backgroundColor: theme.surfaceSubtle }
                    ]}>
                      {isItemOwner ? (
                        <Ionicons name="ribbon" size={18} color="#D97706" />
                      ) : (
                        <Text style={[
                          styles.avatarText,
                          {
                            color: isItemCoAdmin
                              ? theme.accentText
                              : isItemHousekeeping
                              ? theme.dirty
                              : theme.text
                          }
                        ]}>
                          {item.name ? item.name.charAt(0).toUpperCase() : 'U'}
                        </Text>
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={styles.nameBadgeInline}>
                        <Text style={[styles.memberName, { color: theme.text }]}>{item.name}</Text>
                        {item.id === activeStaff?.id && (
                          <View style={[styles.youPill, { backgroundColor: theme.surfaceSubtle }]}>
                            <Text style={[styles.youPillText, { color: theme.textSecondary }]}>YOU</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.memberSub, { color: theme.textSecondary }]}>
                        {isItemOwner
                          ? 'Supreme Owner'
                          : `Position: ${formatRoleLabel(item.role)}`}
                        {item.phone ? ` • ${item.phone}` : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.memberRight}>
                    <View style={[
                      styles.roleBadge,
                      isItemOwner
                        ? { backgroundColor: '#FEF3C7' }
                        : isItemCoAdmin
                        ? { backgroundColor: theme.accentSubtle }
                        : isItemHousekeeping
                        ? { backgroundColor: theme.dirtySubtle }
                        : { backgroundColor: theme.surfaceSubtle }
                    ]}>
                      <Text style={[
                        styles.roleBadgeText,
                        {
                          color: isItemOwner
                            ? '#D97706'
                            : isItemCoAdmin
                            ? theme.accentText
                            : isItemHousekeeping
                            ? theme.dirty
                            : theme.textSecondary
                        }
                      ]}>
                        {formatRoleLabel(item.role).toUpperCase()}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
                  </View>
                </Pressable>
              );
            })}

            {activeMembers.length === 0 && (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: theme.textSecondary, fontSize: 14 }}>No team members found.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Apple HIG Member Details, Remarks & Removal Modal ─────────── */}
      <Modal
        visible={detailModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
          style={styles.modalBackdrop}
        >
          <View style={[styles.appleModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {/* Modal Header */}
            <View style={styles.appleModalHeader}>
              <View style={[
                styles.modalAvatar,
                selectedMember?.role === 'owner'
                  ? { backgroundColor: '#FEF3C7' }
                  : { backgroundColor: theme.surfaceSubtle }
              ]}>
                <Ionicons
                  name={
                    selectedMember?.role === 'owner' ? 'ribbon' :
                    selectedMember?.role === 'co_admin' ? 'shield-checkmark' :
                    selectedMember?.role === 'housekeeping' ? 'bed' : 'desktop'
                  }
                  size={26}
                  color={selectedMember?.role === 'owner' ? '#D97706' : theme.accentText}
                />
              </View>

              <Text style={[styles.modalMemberName, { color: theme.text }]}>
                {selectedMember?.name}
              </Text>
              <Text style={[styles.modalMemberRole, { color: theme.accentText }]}>
                {selectedMember?.role === 'owner' ? 'Supreme Owner' : formatRoleLabel(selectedMember?.role || 'desk')}
                {selectedMember?.phone ? ` • ${selectedMember.phone}` : ''}
              </Text>
            </View>

            <ScrollView
              style={{ maxHeight: 340 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Previous Remarks Ledger */}
              <View style={styles.remarksSection}>
                <View style={styles.remarksHeaderRow}>
                  <Ionicons name="newspaper-outline" size={15} color={theme.textSecondary} />
                  <Text style={[styles.remarksHeaderTitle, { color: theme.textSecondary }]}>
                    PREVIOUS PERFORMANCE & EXIT REMARKS
                  </Text>
                </View>

                {loadingRemarks ? (
                  <ActivityIndicator size="small" color={theme.accent} style={{ marginVertical: 8 }} />
                ) : memberRemarks.length > 0 ? (
                  memberRemarks.map((rem, idx) => (
                    <View key={rem.id || idx} style={[styles.remarkItemCard, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}>
                      <Text style={[styles.remarkText, { color: theme.text }]}>“{rem.remark}”</Text>
                      <Text style={[styles.remarkMeta, { color: theme.textTertiary }]}>
                        {rem.property_name} • By {rem.removed_by_name} ({formatRoleLabel(rem.removed_by_role)}) • {new Date(rem.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={[styles.noRemarksText, { color: theme.textTertiary }]}>
                    No previous remarks or disciplinary entries on record.
                  </Text>
                )}
              </View>

              {/* Status / Permission Notice */}
              {selectedMember?.role === 'owner' ? (
                <View style={styles.supremeBadgeContainer}>
                  <Ionicons name="shield-checkmark" size={18} color="#D97706" />
                  <Text style={styles.supremeBadgeText}>
                    Supreme Property Owner • Permanent authority, cannot be removed.
                  </Text>
                </View>
              ) : selectedMember?.id === activeStaff?.id ? (
                <View style={[styles.noticeContainer, { backgroundColor: theme.surfaceSubtle }]}>
                  <Ionicons name="information-circle-outline" size={18} color={theme.textSecondary} />
                  <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
                    This is your active logged-in profile.
                  </Text>
                </View>
              ) : selectedMember && canRemoveMember(selectedMember) ? (
                /* Removal Controls with Optional Remark */
                <View style={styles.removalContainer}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    OPTIONAL EXIT REMARK FOR LEDGER
                  </Text>
                  <TextInput
                    style={[styles.remarkInput, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border, color: theme.text }]}
                    placeholder="e.g. Completed tenure professionally, punctual, good guest reviews..."
                    placeholderTextColor={theme.textTertiary}
                    value={removalRemark}
                    onChangeText={setRemovalRemark}
                    multiline={true}
                    numberOfLines={3}
                  />

                  {/* Role Change Option for Co-Admin / Owner */}
                  {canManage && (
                    <TouchableOpacity
                      style={[styles.changeRoleBtn, { borderColor: theme.border }]}
                      onPress={() => {
                        setNewRoleInput(selectedMember.role);
                        setChangeRoleVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="swap-horizontal-outline" size={16} color={theme.text} />
                      <Text style={[styles.changeRoleText, { color: theme.text }]}>Change Assigned Position</Text>
                    </TouchableOpacity>
                  )}

                  {/* Destructive Disconnect Button */}
                  <TouchableOpacity
                    style={styles.disconnectBtn}
                    onPress={handleConfirmRemoval}
                    disabled={actionSubmitting}
                    activeOpacity={0.8}
                  >
                    {actionSubmitting ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="person-remove-outline" size={16} color="#ffffff" />
                        <Text style={styles.disconnectBtnText}>
                          Disconnect {selectedMember.name}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.noticeContainer, { backgroundColor: theme.surfaceSubtle }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={theme.textSecondary} />
                  <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
                    {selectedMember?.role === 'co_admin'
                      ? 'Co-Admins can only be removed by the property Owner.'
                      : 'You do not have permission to disconnect this team member.'}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Close Modal Button */}
            <TouchableOpacity
              style={[styles.closeModalBtn, { backgroundColor: theme.surfaceSubtle, borderColor: theme.borderSubtle }]}
              onPress={() => setDetailModalVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.closeModalText, { color: theme.text }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Change Role Modal ────────────────────────────────────────── */}
      <Modal
        visible={changeRoleVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setChangeRoleVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.appleModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalMemberName, { color: theme.text, marginBottom: 12 }]}>
              Change Position: {selectedMember?.name}
            </Text>

            <View style={{ gap: 8, marginVertical: 12 }}>
              {(['co_admin', 'desk', 'housekeeping'] as StaffRole[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleSelectChip,
                    { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceSubtle },
                    newRoleInput === r && { backgroundColor: theme.accent, borderColor: theme.accent }
                  ]}
                  onPress={() => setNewRoleInput(r)}
                >
                  <Text style={[
                    styles.roleSelectChipText,
                    { color: theme.text },
                    newRoleInput === r && { color: '#ffffff', fontWeight: '700' }
                  ]}>
                    {formatRoleLabel(r)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => setChangeRoleVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: theme.accent }]}
                onPress={handleUpdateRole}
                disabled={actionSubmitting}
              >
                {actionSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Save Position</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14 },
  scrollContent: { flexGrow: 1, padding: 16, paddingBottom: 40 },

  // ── Code Generator Card ───────────────────────────────────────────
  codeGenCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 22,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
      android: { elevation: 2 },
      default: {},
    }),
  },
  codeGenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  codeIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeGenTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, marginBottom: 2 },
  codeGenSub: { fontSize: 13, lineHeight: 18 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  positionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  positionChipText: { fontSize: 13, fontWeight: '600' },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  generateBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },

  // ── Apple HIG Resulting Code Box ──────────────────────────────────
  codeResultCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
  },
  codeResultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  roleTagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  validityBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  codeResultText: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 4,
    marginVertical: 6,
  },
  codeResultHelp: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 14,
  },
  codeActionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  codeActionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
  },
  codeActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  codeActionPillPrimary: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
  },
  codeActionTextPrimary: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Inset Grouped Active Members ──────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  groupCounter: {
    fontSize: 12,
    fontWeight: '500',
  },
  groupedCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 18,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 1 },
      default: {},
    }),
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  memberRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700' },
  nameBadgeInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontSize: 15, fontWeight: '600' },
  youPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  youPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  memberSub: { fontSize: 12, marginTop: 2 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // ── Pending Approvals ─────────────────────────────────────────────
  pendingCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 18,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  pendingTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  pendingItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // ── Apple HIG Modal Styles ────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  appleModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24 },
      android: { elevation: 12 },
      default: {},
    }),
  },
  appleModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  modalMemberName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  modalMemberRole: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },

  // Remarks Section
  remarksSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  remarksHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  remarksHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  remarkItemCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  remarkText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  remarkMeta: {
    fontSize: 11,
    marginTop: 4,
  },
  noRemarksText: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 4,
  },

  // Supreme & Notice Badges
  supremeBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
  },
  supremeBadgeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 18,
  },
  noticeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  // Removal Container
  removalContainer: {
    marginTop: 6,
    marginBottom: 14,
  },
  remarkInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    fontSize: 13,
    minHeight: 64,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  changeRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  changeRoleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    height: 46,
    borderRadius: 14,
  },
  disconnectBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },

  closeModalBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  closeModalText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Role select chips
  roleSelectChip: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  roleSelectChipText: { fontSize: 13, fontWeight: '600' },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600' },
  modalConfirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalConfirmText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});
